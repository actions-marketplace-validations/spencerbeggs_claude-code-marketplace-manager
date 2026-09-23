---
title: Schema.NonEmptyArray looks safe here and fails the ajv strict gate
description: Schema.NonEmptyArray is the obvious spelling for "plugins must be non-empty" and type-checks fine, but its Draft-07 lowering trips ajv's strict-mode gate in a published schema until effected#818 is fixed.
type: Gotcha
status: stable
resource: ../../src/schema/input.ts
stale_after: 2027-03-23T00:00:00Z
tags: [deps, testing]
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    last_modified: 2026-09-23T00:00:00Z
  - id: upstream-issue
    resource: 'https://github.com/spencerbeggs/effected/issues/818'
    title: "@effected/schemastore's Draft-07 lowering of NonEmptyArray"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
  body_sha256: d08b7222111d946bfe464331bd9cb06f4ddb795b5ebff469a0cb0398e3e169b6
---

# `Schema.NonEmptyArray` looks safe here and fails the ajv strict gate

## What a reader sees

`JsonInput.plugins` needs to be non-empty — an empty `plugins: []` array in
a `json` payload has nothing to patch and should be rejected. Effect ships
`Schema.NonEmptyArray` for exactly this, and it type-checks: decoding
through it correctly rejects an empty array at runtime, and its use reads
as the obvious, idiomatic spelling of the constraint.

## What they conclude

Since `Schema.NonEmptyArray` decodes correctly and is the schema-library's
own non-empty-array type, it should be safe to publish — the generated JSON
Schema document ought to just carry whatever `minItems`-equivalent
constraint the library lowers it to.

## What is true

`@effected/schemastore`'s Draft-07 lowering of `Schema.NonEmptyArray` emits
a 1-tuple `items` (`items: [<schema>]`) without a matching `minItems`/
`maxItems`/`additionalItems` — a shape ajv's strict mode rejects outright
with `"items" is 1-tuple, but minItems or maxItems/additionalItems are not
specified or different` (spencerbeggs/effected#818). This surfaces only at
`pnpm schema:build`'s ajv strict-mode gate — not at `tsc`, not at any
runtime decode, and not in a test that only exercises the Effect Schema
directly — so the failure mode is a schema-build error naming an internal
JSON Schema keyword, on a field whose Effect Schema source looks completely
unremarkable.

The workaround in this codebase is `Schema.Array(PluginPatch).check(Schema.isMinLength(1))`
(`src/schema/input.ts`), which expresses the identical runtime constraint
— reject an empty array — but lowers to a plain `minItems: 1` on an
ordinary `items` schema, which passes the strict-mode gate cleanly.

## Related

[effect-schemas](../models/effect-schemas.md) documents the schema-build
pipeline this trips inside, and
`Arr.NonEmptyReadonlyArray<ValidatedManifestChange>` on `LandParams.changes`
(see
[landing-requires-a-validated-non-noop-change](../invariants/landing-requires-a-validated-non-noop-change.md))
is unaffected — that type is never lowered to JSON Schema, since
`LandParams` is not a published document.
