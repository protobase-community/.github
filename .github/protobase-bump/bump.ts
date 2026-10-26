// Moves the template in <dir> to a Protobase release: the one given, or the latest on npm. Every @protobase/*
// package gets the same exact version, as the Protobase CLI requires. It prints `current`, `target` and `changed`
// as GITHUB_OUTPUT lines and never moves a template to an older release.
//
//   bun bump.ts <dir> [version]

import { join } from "node:path"
import { compareReleases, protobaseVersions, setProtobaseVersion, setReadmeVersion } from "./version"

const [dir, requested] = process.argv.slice(2)
if (!dir) throw new Error("Usage: bun bump.ts <dir> [version]")

const packagePath = join(dir, "package.json")
const readmePath = join(dir, "README.md")

const packageJson = await Bun.file(packagePath).text()
const versions = protobaseVersions(packageJson)
if (versions.length === 0) throw new Error(`No @protobase/* dependencies in ${packagePath}`)

const current = versions.reduce((newest, version) => (compareReleases(version, newest) > 0 ? version : newest))
const target = requested || (await latestRelease())
if (compareReleases(target, current) < 0) throw new Error(`Refusing to move from ${current} down to ${target}`)

const changed = versions.some((version) => version !== target)
if (changed) {
  await Bun.write(packagePath, setProtobaseVersion(packageJson, target))
  const readme = Bun.file(readmePath)
  if (await readme.exists()) await Bun.write(readmePath, setReadmeVersion(await readme.text(), target))
}

console.log(`current=${current}\ntarget=${target}\nchanged=${changed}`)

async function latestRelease() {
  const response = await fetch("https://registry.npmjs.org/-/package/@protobase/cli/dist-tags")
  if (!response.ok) throw new Error(`npm registry answered ${response.status} for the @protobase/cli dist-tags`)
  const tags = (await response.json()) as { latest: string }
  return tags.latest
}
