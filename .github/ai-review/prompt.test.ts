import { describe, expect, test } from "bun:test"
import { buildSystemPrompt, loadTemplates } from "./prompt"

const templates = await loadTemplates()
const rules = [{ name: "CONTRIBUTING.md", text: "Keep each pull request to one change.\n" }]

describe("buildSystemPrompt", () => {
  test("names the repository and holds its rules", () => {
    const prompt = buildSystemPrompt(templates, { repository: "acme/app", description: "An app.", frameworkGeneric: false, rules })
    expect(prompt).toStartWith("You are a senior reviewer of pull requests to acme/app (An app).")
    expect(prompt).toContain('answer exactly "No issues found."')
    expect(prompt).toContain("### CONTRIBUTING.md\n\nKeep each pull request to one change.")
    expect(prompt).not.toContain("Framework code stays generic")
    expect(prompt).not.toContain("{")
  })

  test("adds the framework-generic checks only when asked", () => {
    const prompt = buildSystemPrompt(templates, { repository: "acme/framework", description: null, frameworkGeneric: true, rules })
    expect(prompt).toContain("## Framework code stays generic")
    expect(prompt).toContain("Put the generic-framework findings first.")
    expect(prompt).toStartWith("You are a senior reviewer of pull requests to acme/framework. ")
  })

  test("leaves out the rules section when the repository has none", () => {
    const prompt = buildSystemPrompt(templates, { repository: "acme/app", description: null, frameworkGeneric: false, rules: [] })
    expect(prompt).not.toContain("## Project rules")
  })
})
