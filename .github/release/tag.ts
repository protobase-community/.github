// A release's tag: the repository's version from its version file, such as ProtoVirt's v0.1.2, or the UTC date and time
// it was cut, such as v2026-11-01-0900. Pure.

export function versionTag(versionFile: string | null) {
  if (versionFile === null) throw new Error("The version file does not exist at the release's commit")
  const { version } = JSON.parse(versionFile) as { version?: unknown }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) throw new Error(`The version file's version is not MAJOR.MINOR.PATCH: ${String(version)}`)
  return `v${version}`
}

export function dateTag(now: Date) {
  const iso = now.toISOString()
  return `v${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`
}
