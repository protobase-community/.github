// The review's system prompt: the reviewer's task, the framework-generic checks for a framework repository, how
// to answer, and the repository's own rules as of the pull request's base commit.
import { join } from "node:path"

export type Rule = { name: string; text: string }

export type SystemPromptInput = {
  repository: string
  description: string | null
  frameworkGeneric: boolean
  rules: Rule[]
}

type Templates = Record<"review" | "frameworkGeneric" | "answer" | "rules", string>

export async function loadTemplates(): Promise<Templates> {
  const read = (name: string) => Bun.file(join(import.meta.dir, "prompts", name)).text()
  return {
    review: await read("review.md"),
    frameworkGeneric: await read("framework-generic.md"),
    answer: await read("answer.md"),
    rules: await read("rules.md"),
  }
}

export function buildSystemPrompt(templates: Templates, input: SystemPromptInput) {
  const description = input.description ? ` (${input.description.replace(/\.$/, "")})` : ""
  const frameworkFirst = input.frameworkGeneric ? " Put the generic-framework findings first." : ""
  const sections = [
    templates.review.replace("{repository}", input.repository).replace("{description}", description),
  ]
  if (input.frameworkGeneric) sections.push(templates.frameworkGeneric)
  sections.push(templates.answer.replace("{framework_first}", frameworkFirst))
  if (input.rules.length > 0) {
    sections.push(templates.rules, ...input.rules.map((rule) => `### ${rule.name}\n\n${rule.text.trim()}`))
  }
  return sections.map((section) => section.trim()).join("\n\n")
}
