// Tries once to merge the pull requests a workflow event is about and never waits: a check still running leaves the
// merge to the event of the one that finishes last. The shared auto-merge-approvals workflow runs it through action.yml.
//
//   GITHUB_REPOSITORY=owner/name GITHUB_EVENT_NAME=status GITHUB_EVENT_PATH=event.json GITHUB_RUN_ID=1 GITHUB_TOKEN=... \
//   DEFAULT_BRANCH=main DISPATCH_AFTER_MERGE='release.yml docs.yml' bun .github/auto-merge-approvals/main.ts
import { readFileSync } from 'node:fs'
import { checksState, reviewBotFinished } from './checks'
import { approvedLogins, botApprovedHead, pullRefusal, refusal } from './decision'
import { cleanFollowUpAt } from './follow-up'
import { gitHub } from './github'
import { land } from './land'
import { eventTarget, pullsOfCommit } from './target'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required('GITHUB_REPOSITORY')
const after = { defaultBranch: required('DEFAULT_BRANCH'), dispatch: (process.env.DISPATCH_AFTER_MERGE ?? '').split(/\s+/).filter((name) => name !== '') }
const github = gitHub(required('GITHUB_TOKEN'), repository)

async function pullNumbers() {
  const event = JSON.parse(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8'))
  const target = eventTarget(required('GITHUB_EVENT_NAME'), event)
  if (target.sha === undefined) return [target.number]
  return pullsOfCommit(await github.commitPulls(target.sha), target.sha, repository)
}

async function checksOf(sha: string) {
  const [runs, checkRuns, statuses, ownWorkflowId] = await Promise.all([
    github.workflowRuns(sha),
    github.checkRuns(sha),
    github.statuses(sha),
    github.workflowId(required('GITHUB_RUN_ID')),
  ])
  return { checks: checksState(runs, checkRuns, statuses, ownWorkflowId), checkRuns }
}

// Why the pull request may not merge now, or null. It reads no more of GitHub than the pull request itself needs.
async function whyNot(pull: Awaited<ReturnType<typeof github.pullRequest>>) {
  const refused = pullRefusal(pull, repository)
  if (refused) return refused

  const [timeline, reviews, comments, head] = await Promise.all([
    github.timeline(pull.number),
    github.reviews(pull.number),
    github.comments(pull.number),
    checksOf(pull.head.sha),
  ])
  // The author's access decides whether the follow-up check's verdict counts.
  const logins = new Set(approvedLogins(reviews, pull.head.sha))
  if (pull.user) logins.add(pull.user.login)
  const roles = Object.fromEntries(await Promise.all([...logins].map(async (login) => [login, await github.role(login)])))
  const followUpCleanAt = cleanFollowUpAt(comments, pull.head.sha)
  const botFinished = reviewBotFinished(head.checkRuns, botApprovedHead(reviews, pull.head.sha))
  return refusal({ repository, pull, timeline, reviews, roles, followUpCleanAt, checks: head.checks, reviewBotFinished: botFinished })
}

for (const number of await pullNumbers()) {
  const pull = await github.pullRequest(number)
  const reason = await whyNot(pull)
  if (reason) {
    console.log(`Not merging #${number}: ${reason}.`)
    continue
  }

  await land(github, pull, after)
}
