// Moves the template in <dir> to a Protobase release: the one given, or the latest on npm. Every @protobase/*
// package gets the same specifier, the release's caret range (^<version>). It prints `current`, `target` and `changed`
// as GITHUB_OUTPUT lines and never moves a template to an older release.
//
//   bun bump.ts <dir> [version]

import { join } from "node:path"
import {
  currentRelease,
  isOlder,
  protobaseSpecifiers,
  release,
  setProtobaseSpecifier,
  setReadmeVersion,
  specifierFor,
} from "./version"

const [dir, requested] = process.argv.slice(2)
if (!dir) throw new Error("Usage: bun bump.ts <dir> [version]")

const packagePath = join(dir, "package.json")
const readmePath = join(dir, "README.md")

const packageJson = await Bun.file(packagePath).text()
const specifiers = protobaseSpecifiers(packageJson)
if (specifiers.length === 0) throw new Error(`No @protobase/* dependencies in ${packagePath}`)

const current = currentRelease(specifiers)
const target = release(requested || (await latestRelease()))
if (isOlder(target, current)) throw new Error(`Refusing to move from ${current} down to ${target}`)

const specifier = specifierFor(target)
const changed = specifiers.some((existing) => existing !== specifier)
if (changed) {
  await Bun.write(packagePath, setProtobaseSpecifier(packageJson, specifier))
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
