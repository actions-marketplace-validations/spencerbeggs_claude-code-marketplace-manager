---
type: Decision
title: Repository renamed at v2; schema hosting restarts at 2.0
description: The repository is renamed claude-code-marketplace-manager to ai-plugin-marketplace-manager at v2, and the tracked schema label list restarts fresh at 2.0 rather than continuing 1.0 under the new name; schemas/1.0/ stays frozen, committed, and untracked, relying on GitHub's rename redirect.
status: draft
tags:
  - compat
  - release
sources:
  - id: input-schema
    resource: ../../src/schema/input.ts
    title: "OUTPUT_SCHEMA_VERSIONS restarted at [\"2.0\"] and the repo name in hosted()"
  - id: versioned-schema-documents
    resource: ../decisions/versioned-schema-documents.md
    title: "the per-label frozen-file mechanism this decision restarts"
  - id: design-spec
    resource: ../../docs/superpowers/specs/2026-09-23-v2-multi-marketplace-design.md
    title: "Identity and §4 Schema hosting across the rename"
generated:
  by: okfit/claude-code
  at: 2026-09-23T20:44:15Z
  body_sha256: c4781f8dd071f673fad8f626be884c0deee36d8b61b26cdc904532457d7ecfa4
---

# Repository renamed at v2; schema hosting restarts at 2.0

## Context

v2 adds a second marketplace, and the maintainer chose to rename the
repository from `spencerbeggs/claude-code-marketplace-manager` to
`spencerbeggs/ai-plugin-marketplace-manager` to match, since the action no
longer edits only a Claude Code manifest.
[versioned-schema-documents](versioned-schema-documents.md) already commits
this repository to a frozen-file-per-label scheme: `OUTPUT_SCHEMA_VERSIONS`
tracks every label the CLI still verifies, and each hosted `$id` is derived
from the identity's `repo` field via `HostedSchema.github`.

That derivation is the problem a rename creates. `schemas/1.0/output.json`
and `schemas/1.0/input.json` are already committed with `$id`s baked in
under the *old* repository name. If `OUTPUT_SCHEMA_VERSIONS` kept `"1.0"`
after the rename, the CLI would derive the `1.0` label's expected `$id`
from the *new* name (`ai-plugin-marketplace-manager`) and compare it
against files that declare the old one — `pnpm schema:check` would report
drift on files nobody intends to touch, for a label that will never again
match what the CLI computes.

## Decision

Two parts:

1. **The repository is renamed** to `spencerbeggs/ai-plugin-marketplace-manager`
   as part of the v2 release; `action.yml`'s `name:` becomes "AI Plugin
   Marketplace Manager"; `hosted()` in `src/schema/input.ts` points at the
   new repo name.
2. **`OUTPUT_SCHEMA_VERSIONS` restarts at `["2.0"]`, dropping `"1.0"` from
   the tracked list entirely**, rather than appending `2.0` to a list that
   still names `1.0`. `schemas/1.0/output.json` and `schemas/1.0/input.json`
   stay committed byte-for-byte, at their original `$id`s, under the old
   identity — the CLI simply never looks at them again. They are served at
   their original URLs
   (`https://raw.githubusercontent.com/spencerbeggs/claude-code-marketplace-manager/main/schemas/1.0/output.json`
   and the `input.json` sibling) through GitHub's repository-rename
   redirect, which is expected — not yet independently verified against
   `raw.githubusercontent.com`'s specific behavior — to continue resolving
   requests made against the old repository name.

## Alternatives rejected

- **Keep `"1.0"` in `OUTPUT_SCHEMA_VERSIONS` after the rename.** Rejected:
  the CLI's frozen-label check derives each tracked label's expected `$id`
  from the *current* repo name, so this fails `schema:check` permanently —
  there is no way to make a file that declares the old name pass a check
  computed against the new one, short of rewriting the frozen file (which
  would itself be drift against every already-published `1.0` payload's
  `$schema` value).
- **Rewrite `schemas/1.0/`'s `$id`s to the new repository name.** Rejected:
  those files are already published — a payload emitted under v1 carries a
  `$schema` pointing at the *old* URL, and rewriting the committed file's
  `$id` would not change what that URL serves going forward under the
  redirect, while diverging the committed content from what was actually
  shipped.
- **Stand up a stub `claude-code-marketplace-manager` repository** serving
  only `schemas/1.0/`, bypassing reliance on the rename redirect entirely.
  Deferred rather than rejected outright: the design explicitly calls out
  verifying the redirect's behavior before release as a prerequisite, with
  this stub as the fallback if it does not hold.

## Consequences

- `schemas/1.0/` is permanently excluded from `pnpm schema:build` /
  `pnpm schema:check`'s walk — those commands only ever see `2.0` onward.
  A future contributor cannot "fix" this by re-adding `"1.0"` to
  `OUTPUT_SCHEMA_VERSIONS`; doing so reintroduces the exact failure this
  decision exists to avoid.
- Every URL a v1 payload's `$schema` field carries depends on GitHub's
  repository-rename redirect continuing to serve `raw.githubusercontent.com`
  requests against the old owner/repo pair. This is treated as verified
  behavior to confirm before the v2 release ships, not as a settled fact —
  hence this Decision is `status: draft` pending that confirmation and
  human verification.
- `2.0` is the first hosted label under the new identity; a second schema
  version bump proceeds exactly as
  [bump-the-output-schema-version](../runbooks/bump-the-output-schema-version.md)
  describes, appending to `["2.0", ...]` rather than restarting again.
