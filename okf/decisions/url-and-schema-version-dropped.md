---
type: Decision
title: url input and in-band schemaVersion dropped
description: v2 removes the url input/patch field entirely (only sha and path can be repinned) and removes ReportOutput's in-band schemaVersion field, leaving the schema version expressed only in the $schema URL's schemas/<version>/ path.
status: draft
tags:
  - architecture
  - compat
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "PluginPatch with no url field; SCHEMA_VERSION removed from report-output.ts"
  - id: inputs
    resource: ../../src/inputs.ts
    title: "rejectLegacyUrl rejects a v1 payload's url key by name"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "§1 Patch inputs and §3 result 2.0"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
  body_sha256: c8021390307b5a13924de1ad6a83cef6fdd5e0b70f912655d17b9fae65b1194b
---

# `url` input and in-band `schemaVersion` dropped

## Context

v1's patch shape carried three optional repinnable fields —
`url`/`path`/`sha` — and `ReportOutput` carried an in-band `schemaVersion`
literal alongside the `$schema` URL, which already encoded the same
version in its `schemas/<version>/` path segment. v2 adds a `marketplace`
field to every patch and needs the manual/`json` decode paths and the
`result` shape to stay simple as a second marketplace kind (with its own
`source` shape) is introduced.

## Decision

Two independent drops, both v2 contract breaks:

1. **`url` is removed from the patch shape and the manual-path inputs.**
   `PluginPatch` (`src/schema/input.ts`) has no `url` field; the manual
   path has no `url` action input at all. A `json` payload's entry
   carrying `url` — the shape every v1 sender used — is rejected by name
   before the generic schema decode runs (`rejectLegacyUrl` in
   `src/inputs.ts`), and `decodeJsonInput`'s `onExcessProperty: "error"`
   would reject it anyway if that check were ever bypassed. Only `sha`
   (now required on the manual path) and `path` (still optional) can be
   repinned.
2. **`ReportOutput.schemaVersion` is removed.** The version a payload's
   shape corresponds to is expressed exactly once, in the `$schema` URL's
   `schemas/<version>/` path segment (`SCHEMA_URL`,
   `OutputSchemaIdentity.$id`) — never duplicated as a second, in-band
   field that could drift from it.

## Alternatives rejected

- **Keep `url` and add a `github`-source equivalent for Copilot.** Rejected:
  Copilot pins by `sha` and optionally `path` against a fixed `repo`, not
  by resolving a source URL, and Claude Code's `url` was never meant to be
  repinned in the steady state — a plugin's source repository does not
  move. Carrying a field that both marketplaces' real usage leaves unset is
  surface with no observed need.
- **Keep `schemaVersion` for a redundant machine-readable version check
  independent of parsing the URL.** Rejected: `SCHEMA_URL` already is the
  full, resolvable identity of the shape a payload was written against;
  a consumer that needs the version number alone can extract it from the
  URL's path segment, and a field that merely restates part of another
  field's value is exactly the kind of duplication
  [versioned-schema-documents](versioned-schema-documents.md) was written
  to avoid at the document level.

## Consequences

- A v1 sender's `json` payload (which always carries `url` on at least the
  plugins it ever repinned) fails cleanly with `rejectLegacyUrl`'s message
  naming the exact index and field, rather than being partially applied or
  failing with a generic schema error — see
  [action-inputs](../interfaces/action-inputs.md).
- `groupPlugins`'s `ChangedPlugin.fields` type narrows from
  `"url" | "path" | "sha"` to `"path" | "sha"`; a `result` payload can never
  report a `url` field change again, for either marketplace.
- Any consumer parsing v1's `result.schemaVersion` field directly (rather
  than reading `$schema`) breaks on the v2 output; the migration note in
  the README calls this out explicitly.
