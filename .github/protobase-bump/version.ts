// Text edits that move a template to another Protobase version. They change only the version strings, so the
// rest of package.json and README.md keeps its formatting.

const dependency = /("@protobase\/[^"]+"\s*:\s*)"([^"]*)"/g
const readmeMention = /(Tested with Protobase \*\*)[^*]+(\*\*)/g
const release = /^(\d+)\.(\d+)\.(\d+)$/

export function protobaseVersions(packageJson: string) {
  return [...packageJson.matchAll(dependency)].map((match) => match[2])
}

export function setProtobaseVersion(packageJson: string, version: string) {
  return packageJson.replace(dependency, (_, key) => `${key}"${version}"`)
}

export function setReadmeVersion(readme: string, version: string) {
  return readme.replace(readmeMention, (_, before, after) => `${before}${version}${after}`)
}

export function compareReleases(a: string, b: string) {
  const left = parseRelease(a)
  const right = parseRelease(b)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function parseRelease(version: string) {
  const match = release.exec(version)
  if (!match) throw new Error(`Not an exact release version: ${version}`)
  return match.slice(1).map(Number)
}
