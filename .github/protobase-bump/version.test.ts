import { describe, expect, test } from "bun:test"
import {
  currentRelease,
  isOlder,
  protobaseSpecifiers,
  release,
  setProtobaseSpecifier,
  setReadmeVersion,
  specifierFor,
} from "./version"

const packageJson = `{
  "dependencies": {
    "@protobase/cli": "~0.46.11",
    "@protobase/ui":"~0.46.12",
    "better-auth": "^1.7.12"
  },
  "devDependencies": {
    "@protobase/schema": "~0.46.11"
  }
}
`

describe("protobaseSpecifiers", () => {
  test("lists the specifier of every @protobase/* dependency", () => {
    expect(protobaseSpecifiers(packageJson)).toEqual(["~0.46.11", "~0.46.12", "~0.46.11"])
  })
})

describe("setProtobaseSpecifier", () => {
  test("sets one specifier on every @protobase/* dependency and leaves the rest as it was", () => {
    expect(setProtobaseSpecifier(packageJson, "~0.47.1")).toBe(`{
  "dependencies": {
    "@protobase/cli": "~0.47.1",
    "@protobase/ui":"~0.47.1",
    "better-auth": "^1.7.12"
  },
  "devDependencies": {
    "@protobase/schema": "~0.47.1"
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

describe("currentRelease", () => {
  test("reads ~ ranges as the release they start at", () => {
    expect(currentRelease(["~0.46.9", "~0.46.12"])).toBe("0.46.12")
  })

  test("reads exact versions", () => {
    expect(currentRelease(["0.46.11", "0.46.9"])).toBe("0.46.11")
  })

  test("rejects a specifier that is not a version or range", () => {
    expect(() => currentRelease(["latest"])).toThrow("Not a version or range")
  })
})

describe("release", () => {
  test("accepts a release and rejects a range or a prerelease", () => {
    expect(release("0.47.1")).toBe("0.47.1")
    expect(() => release("~0.47.1")).toThrow("Not a release version")
    expect(() => release("0.47.0-rc.1")).toThrow("Not a release version")
  })
})

describe("specifierFor", () => {
  test("locks to the minor of the release", () => {
    expect(specifierFor("0.47.1")).toBe("~0.47.1")
  })
})

describe("bumping", () => {
  test("an already current template keeps its specifiers", () => {
    const specifiers = ["~0.46.12", "~0.46.12"]
    expect(specifiers.every((specifier) => specifier === specifierFor("0.46.12"))).toBe(true)
    expect(isOlder("0.46.12", currentRelease(specifiers))).toBe(false)
  })

  test("a newer minor moves the template forward", () => {
    expect(isOlder("0.47.0", currentRelease(["~0.46.12"]))).toBe(false)
    expect(specifierFor("0.47.0")).toBe("~0.47.0")
  })

  test("an older release is refused, ordered by number, not by text", () => {
    expect(isOlder("0.46.9", currentRelease(["~0.46.12"]))).toBe(true)
  })
})
