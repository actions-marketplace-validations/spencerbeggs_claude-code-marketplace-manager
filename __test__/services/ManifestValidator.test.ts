import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { CLAUDE_CODE, COPILOT } from "../../src/marketplaces.js";
import { validateManifest } from "../../src/services/ManifestValidator.js";

const VALID_SOURCE = {
	source: "git-subdir",
	url: "https://github.com/acme/p1",
	path: "plugin",
	sha: "a".repeat(40),
} as const;

const good = JSON.stringify({
	name: "acme",
	owner: { name: "Acme" },
	plugins: [{ name: "p1", source: VALID_SOURCE }],
});

/**
 * A manifest that is structurally valid in every respect except the one field
 * under test.
 *
 * @remarks
 * Building it this way is the point rather than a convenience. The semantic
 * rules run alongside the ajv structural pass and their errors are aggregated
 * into one failure, so a fixture that is *also* structurally broken fails for
 * that reason and proves nothing about the rule it names. That is exactly what
 * went wrong before: this file's sha fixture omitted the top-level `owner` the
 * schema requires, so it failed on `owner` and stayed green with the sha rule
 * deleted from the source. Every negative case below asserts the error text,
 * not merely that something failed.
 */
const withSource = (overrides: Record<string, unknown>): string =>
	JSON.stringify({
		name: "acme",
		owner: { name: "Acme" },
		plugins: [{ name: "p1", source: { ...VALID_SOURCE, ...overrides } }],
	});

/** Fail `manifest`, assert the tag, and hand back the reasons. */
const reasons = (manifest: string, patched: ReadonlyArray<string>, m = CLAUDE_CODE) =>
	Effect.gen(function* () {
		const error = yield* Effect.flip(validateManifest(m, manifest, patched));
		assert.strictEqual(error._tag, "ManifestValidationError");
		assert.strictEqual(error.marketplace, m.id);
		assert.strictEqual(error.path, m.path);
		return error.errors;
	});

describe("validateManifest", () => {
	it.effect("accepts a well-formed manifest", () => validateManifest(CLAUDE_CODE, good, ["p1"]));

	it.effect("accepts a .git suffix and a trailing slash on the url", () =>
		Effect.all([
			validateManifest(CLAUDE_CODE, withSource({ url: "https://github.com/acme/p1.git" }), ["p1"]),
			validateManifest(CLAUDE_CODE, withSource({ url: "https://github.com/acme/p1/" }), ["p1"]),
		]),
	);

	describe("per-plugin rules, on an otherwise valid manifest", () => {
		it.effect("rejects a non-40-hex sha", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ sha: "zzz" }), ["p1"]);
				assert.isTrue(
					errors.some((e) => e.includes("source.sha must be 40-hex lowercase")),
					`expected a sha reason, got ${JSON.stringify(errors)}`,
				);
			}),
		);

		it.effect("rejects an uppercase sha", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ sha: "A".repeat(40) }), ["p1"]);
				assert.isTrue(errors.some((e) => e.includes("source.sha must be 40-hex lowercase")));
			}),
		);

		// The host guard. Without it a patch can re-point a plugin at any origin
		// the runner can reach, which is the one semantic rule here with a
		// security consequence rather than a correctness one.
		it.effect("rejects a non-GitHub url", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ url: "https://evil.example.com/acme/p1" }), ["p1"]);
				assert.isTrue(
					errors.some((e) => e.includes("source.url must be a GitHub URL")),
					`expected a url reason, got ${JSON.stringify(errors)}`,
				);
			}),
		);

		it.effect("rejects a github.com lookalike host", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ url: "https://github.com.evil.test/acme/p1" }), ["p1"]);
				assert.isTrue(errors.some((e) => e.includes("source.url must be a GitHub URL")));
			}),
		);

		it.effect("rejects a plain-http GitHub url", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ url: "http://github.com/acme/p1" }), ["p1"]);
				assert.isTrue(errors.some((e) => e.includes("source.url must be a GitHub URL")));
			}),
		);

		it.effect("rejects an empty path", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ path: "" }), ["p1"]);
				assert.isTrue(
					errors.some((e) => e.includes("source.path must be non-empty")),
					`expected a path reason, got ${JSON.stringify(errors)}`,
				);
			}),
		);

		it.effect("rejects a source kind other than git-subdir", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(withSource({ source: "github-release" }), ["p1"]);
				assert.isTrue(
					errors.some((e) => e.includes('source.source must be "git-subdir"')),
					`expected a source-kind reason, got ${JSON.stringify(errors)}`,
				);
			}),
		);
	});

	// The per-plugin rules are scoped to plugins this run touched, so an
	// untouched plugin carrying a bad field must not fail the manifest. Pins the
	// `continue` in the per-plugin loop.
	//
	// The offending field has to be the url specifically: it is the only one of
	// the four whose bad value is still *structurally* valid, so it isolates the
	// semantic layer. A bad sha or an empty path trips the ajv pass as well, and
	// that pass is not scoped to touched plugins — it would fail here for a
	// reason that has nothing to do with the `continue` being tested.
	it.effect("ignores a bad url on a plugin the run did not patch", () =>
		validateManifest(CLAUDE_CODE, withSource({ url: "https://evil.example.com/acme/p1" }), []),
	);

	it.effect("rejects a patched name that is absent", () =>
		Effect.gen(function* () {
			const errors = yield* reasons(good, ["ghost"]);
			assert.isTrue(
				errors.some((e) => e.includes("patched plugin not present after edit: ghost")),
				`expected an absent-name reason, got ${JSON.stringify(errors)}`,
			);
		}),
	);

	it.effect("rejects text that is not JSON at all", () =>
		Effect.gen(function* () {
			const errors = yield* reasons("{ not json", ["p1"]);
			assert.deepStrictEqual(errors, ["resulting manifest is not valid JSON/JSONC"]);
		}),
	);

	it.effect("aggregates multiple semantic errors on a structurally-valid manifest", () =>
		Effect.gen(function* () {
			const dup = JSON.stringify({
				name: "acme",
				owner: { name: "Acme" },
				plugins: [
					{ name: "dup", source: VALID_SOURCE },
					{ name: "dup", source: VALID_SOURCE },
				],
			});
			const errors = yield* reasons(dup, ["ghost"]);
			assert.isAtLeast(errors.length, 2);
			assert.isTrue(errors.some((e) => e.includes("duplicate")));
			assert.isTrue(errors.some((e) => e.includes("ghost")));
		}),
	);
});

const COPILOT_SOURCE = {
	source: "github",
	repo: "acme/p1",
	path: "plugins/copilot",
	sha: "a".repeat(40),
} as const;

/** A Copilot manifest valid in every respect except the plugin's source overrides. */
const copilotWith = (source: unknown): string =>
	JSON.stringify({
		name: "acme",
		owner: { name: "Acme" },
		plugins: [{ name: "p1", source }],
	});

describe("validateManifest (copilot)", () => {
	it.effect("accepts a well-formed github source", () =>
		validateManifest(COPILOT, copilotWith(COPILOT_SOURCE), ["p1"]),
	);

	it.effect("accepts a github source without a path", () =>
		validateManifest(COPILOT, copilotWith({ source: "github", repo: "acme/p1", sha: "a".repeat(40) }), ["p1"]),
	);

	it.effect("accepts a github source that also carries a ref", () =>
		validateManifest(COPILOT, copilotWith({ ...COPILOT_SOURCE, ref: "v1.0.0" }), ["p1"]),
	);

	describe("structural", () => {
		it.effect("rejects a manifest without owner", () =>
			Effect.gen(function* () {
				const manifest = JSON.stringify({ name: "acme", plugins: [{ name: "p1", source: COPILOT_SOURCE }] });
				const errors = yield* reasons(manifest, ["p1"], COPILOT);
				assert.isTrue(
					errors.some((e) => e.includes("owner")),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("rejects a plugin without source", () =>
			Effect.gen(function* () {
				const manifest = JSON.stringify({ name: "acme", owner: { name: "Acme" }, plugins: [{ name: "p1" }] });
				const errors = yield* reasons(manifest, [], COPILOT);
				assert.isTrue(
					errors.some((e) => e.includes("source")),
					JSON.stringify(errors),
				);
			}),
		);
	});

	describe("semantic, on an otherwise valid manifest", () => {
		it.effect("rejects a bare path-string source on a patched entry", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(copilotWith("plugins/p1"), ["p1"], COPILOT);
				assert.isTrue(
					errors.some((e) => e.includes('source.source must be "github"')),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("rejects a url source on a patched entry", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(
					copilotWith({ source: "url", url: "https://example.com/p.tgz", sha: "a".repeat(40) }),
					["p1"],
					COPILOT,
				);
				assert.isTrue(
					errors.some((e) => e.includes('source.source must be "github"')),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("rejects a repo that is not owner/name", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(
					copilotWith({ ...COPILOT_SOURCE, repo: "https://github.com/acme/p1" }),
					["p1"],
					COPILOT,
				);
				assert.isTrue(
					errors.some((e) => e.includes("source.repo must be owner/name")),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("rejects an empty path when present", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(copilotWith({ ...COPILOT_SOURCE, path: "" }), ["p1"], COPILOT);
				assert.isTrue(
					errors.some((e) => e.includes("source.path must be non-empty when present")),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("rejects a non-40-hex sha", () =>
			Effect.gen(function* () {
				const errors = yield* reasons(copilotWith({ ...COPILOT_SOURCE, sha: "abc" }), ["p1"], COPILOT);
				assert.isTrue(
					errors.some((e) => e.includes("source.sha must be 40-hex lowercase")),
					JSON.stringify(errors),
				);
			}),
		);

		it.effect("ignores an untouched string-source entry", () =>
			validateManifest(COPILOT, copilotWith("plugins/p1"), []),
		);
	});
});
