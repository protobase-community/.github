import { expect, test } from "bun:test"
import { dateTag, versionTag } from "./tag"

test("tags a release with the repository's version", () => {
  expect(versionTag('{ "name": "manager", "version": "0.1.2" }')).toBe("v0.1.2")
  expect(() => versionTag('{ "name": "manager" }')).toThrow("not MAJOR.MINOR.PATCH")
  expect(() => versionTag(null)).toThrow("does not exist")
})

test("tags a release with the UTC date and time it was cut", () => {
  expect(dateTag(new Date("2026-11-01T09:05:41Z"))).toBe("v2026-11-01-0905")
})
