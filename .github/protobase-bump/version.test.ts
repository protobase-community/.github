import { describe, expect, test } from "bun:test"
import { compareReleases, protobaseVersions, setProtobaseVersion, setReadmeVersion } from "./version"

const packageJson = `{
  "dependencies": {
    "@protobase/cli": "0.46.11",
    "@protobase/ui":"0.46.12",
    "better-auth": "^1.7.12"
  },
  "devDependencies": {
    "@protobase/schema": "0.46.11"
  }
}
`

describe("protobaseVersions", () => {
  test("lists the version of every @protobase/* dependency", () => {
    expect(protobaseVersions(packageJson)).toEqual(["0.46.11", "0.46.12", "0.46.11"])
  })
})

describe("setProtobaseVersion", () => {
  test("sets one exact version on every @protobase/* dependency and leaves the rest as it was", () => {
    expect(setProtobaseVersion(packageJson, "0.47.1")).toBe(`{
  "dependencies": {
    "@protobase/cli": "0.47.1",
    "@protobase/ui":"0.47.1",
    "better-auth": "^1.7.12"
  },
  "devDependencies": {
    "@protobase/schema": "0.47.1"
  }
}
`)
  })
})

describe("setReadmeVersion", () => {
  test("updates the version the README says the app is tested with", () => {
    const readme = "- Tested with Protobase **0.46.12**: the `@protobase/*` packages are pinned"
    expect(setReadmeVersion(readme, "0.47.1")).toBe(
      "- Tested with Protobase **0.47.1**: the `@protobase/*` packages are pinned",
    )
  })

  test("leaves a README without that line alone", () => {
    expect(setReadmeVersion("# App\n", "0.47.1")).toBe("# App\n")
  })
})

describe("compareReleases", () => {
  test("orders releases by number, not by text", () => {
    expect(compareReleases("0.46.12", "0.46.9")).toBeGreaterThan(0)
    expect(compareReleases("0.46.15", "0.47.0")).toBeLessThan(0)
    expect(compareReleases("0.47.1", "0.47.1")).toBe(0)
  })

  test("rejects a range or a prerelease", () => {
    expect(() => compareReleases("^0.46.0", "0.46.0")).toThrow("Not an exact release version")
    expect(() => compareReleases("0.47.0-rc.1", "0.46.0")).toThrow("Not an exact release version")
  })
})
