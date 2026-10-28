// Text edits that move a template to another Protobase version. They change only the version strings, so the
// rest of package.json and README.md keeps its formatting. Version parsing and ordering go through semver.

import semver from "semver"

const dependency = /("@protobase\/[^"]+"\s*:\s*)"([^"]*)"/g
const readmeMention = /(Tested with Protobase \*\*)[^*]+(\*\*)/g

export function protobaseSpecifiers(packageJson: string) {
  return [...packageJson.matchAll(dependency)].map((match) => match[2])
}

export function setProtobaseSpecifier(packageJson: string, specifier: string) {
  return packageJson.replace(dependency, (_, key) => `${key}"${specifier}"`)
}

export function setReadmeVersion(readme: string, version: string) {
  return readme.replace(readmeMention, (_, before, after) => `${before}${version}${after}`)
}

// The release a template is on: the newest lowest version any of its specifiers allows, so "^0.46.12",
// "~0.46.12" and "0.46.12" all mean 0.46.12.
export function currentRelease(specifiers: string[]) {
  const releases = specifiers.map((specifier) => {
    const lowest = semver.validRange(specifier) && semver.minVersion(specifier)
    if (!lowest) throw new Error(`Not a version or range: ${specifier}`)
    return lowest.version
  })
  return semver.rsort(releases)[0]
}

export function release(version: string) {
  const parsed = semver.parse(version)
  if (!parsed || parsed.prerelease.length > 0) throw new Error(`Not a release version: ${version}`)
  return parsed.version
}

// The caret range of a release: it takes the release's patches below 1.0 and its minors and patches from 1.0 on.
export function specifierFor(version: string) {
  return `^${release(version)}`
}

export function isOlder(target: string, current: string) {
  return semver.lt(target, current)
}
