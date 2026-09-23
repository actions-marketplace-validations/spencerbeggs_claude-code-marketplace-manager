---
"ai-plugin-marketplace-manager": major
---

## Breaking Changes

### Repository and package renamed

The repository and package move from `claude-code-marketplace-manager` to
`ai-plugin-marketplace-manager`. Point workflows at the new repo and pin
`@v2`:

```yaml
uses: spencerbeggs/ai-plugin-marketplace-manager@v2
```

### Every patch now names a `marketplace`, and `url` is gone

Each entry in the `json` input must declare which marketplace it targets:

```json
{
  "plugins": [
    { "name": "my-plugin", "marketplace": "claude-code", "sha": "a1b2c3..." }
  ]
}
```

`marketplace` is `"claude-code" | "copilot"`. A leftover `url` field from the
v1 shape is rejected outright with a migration error rather than silently
dropped. `sha` is now required on every patch, manual or `json`; `path`
stays optional. Two patches naming the same `(marketplace, name)` pair are also rejected as
duplicates.

### Result output moved to `schemas/2.0/output.json`

`schemaVersion` is gone from the result. Each entry in `plugins[]` now
carries `marketplace` and `manifest` alongside `name` and `fields`, and the
result adds a top-level `manifests[]` listing every manifest file the run
touched (or would touch, in dry-run). `pluginsUpdated` now counts distinct
`(marketplace, name)` pairs. Commit subjects also name the marketplace they
repinned.

## Features

### GitHub Copilot marketplace support

Patches can now target either marketplace manifest in the same run:
`.claude-plugin/marketplace.json` for `git-subdir` sources (Claude Code), or
the new `.github/plugin/marketplace.json` for `github` sources (Copilot).
When a run touches both, every change lands together in one verified commit
or pull request.

A patch may add a `sha` or `path` to an entry that doesn't have one yet,
so an unpinned entry can be pinned by dispatch. If a run targets a manifest that doesn't exist in the checkout, it
fails with a clear error naming the missing file. An unpinnable Copilot
entry — one whose `source` is a bare path string rather than a `github`
source object — fails validation with a readable message instead of a
confusing internal error.
