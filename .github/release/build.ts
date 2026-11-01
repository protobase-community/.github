// One pass of a repository's build to its beta host (../workflows/release-build.yml): moves the beta branch to the
// newest development commit whose checks passed (commit-checks.ts) and that the dev environment runs healthy, and starts
// the deploy workflow on it, whose passing run the beta host deploys. GITHUB_TOKEN's push starts no workflow, so the
// pass starts it itself. A commit the beta branch has already, or none that passed, changes nothing.
//
//   REPOSITORY=owner/name GITHUB_TOKEN=... [RUN_ID=...] [DEVELOPMENT_BRANCH=development] [BETA_BRANCH=beta] \
//     [DEPLOYED_URL= FAILED_URL= HEALTH_URL=] DEPLOY_WORKFLOW=test.yml [WITHOUT_CI=true] bun build.ts
import { commitChecks } from "./commit-checks"
import { devEnvironment } from "./dev-environment"
import { devGate } from "./gates"
import { gitHub } from "./github"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const development = process.env.DEVELOPMENT_BRANCH || "development"
const beta = process.env.BETA_BRANCH || "beta"
const deployWorkflow = required("DEPLOY_WORKFLOW")
const deployedUrl = process.env.DEPLOYED_URL || null
const github = gitHub(required("GITHUB_TOKEN"), repository)
const ownWorkflowId = process.env.RUN_ID ? (await github.workflowRun(Number(process.env.RUN_ID))).workflow_id : 0
const checksOf = commitChecks(github, { development, ownWorkflowId, withoutCi: process.env.WITHOUT_CI === "true" })

// At most this many of development's newest commits are looked at.
const maxCandidates = 20
const betaHead = await github.branchHead(beta)
const ahead = betaHead ? await github.commitsAhead(beta, development) : await github.commitsAhead(await github.defaultBranch(), development)
if (ahead.length === 0) {
  console.log(`${beta} has everything ${development} has.`)
  process.exit(0)
}

const dev = deployedUrl
  ? await devEnvironment({ deployedUrl, failedUrl: process.env.FAILED_URL || "", healthUrl: required("HEALTH_URL") })
  : null
for (const candidate of ahead.slice(-maxCandidates).reverse()) {
  const checks = await checksOf(candidate.sha)
  const devCheck = dev
    ? devGate(candidate.sha, { ...dev, hasCommit: dev.deployed !== null && (await github.contains(dev.deployed, candidate.sha)) })
    : null
  console.log(`${candidate.sha.slice(0, 7)}: ${checks.text}${devCheck ? `; dev ${devCheck.text}` : ""}`)
  if (checks.state !== "passed" || (devCheck && devCheck.state !== "passed")) continue
  await github.moveBranch(beta, candidate.sha)
  await github.dispatch(deployWorkflow, beta)
  console.log(`${beta} is at ${candidate.sha.slice(0, 7)}; started ${deployWorkflow} on it.`)
  process.exit(0)
}
console.log(`No commit of the newest ${maxCandidates} on ${development} is ready for ${beta} yet.`)
