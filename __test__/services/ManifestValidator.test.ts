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

/** A structurally valid manifest whose one plugin, `p1`, carries `source`. */
const manifestWith = (source: unknown): string =>
	JSON.stringify({
		name: "acme",
		owner: { name: "Acme" },
		plugins: [{ name: "p1", source }],
	});

const good = manifestWith(VALID_SOURCE);

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
const withSource = (overrides: Record<string, unknown>): string => manifestWith({ ...VALID_SOURCE, ...overrides });

/** Fail `manifest`, assert the tag, and hand back the reasons. */
const reasons = (manifest: string, patched: ReadonlyArray<string>, m = CLAUDE_CODE) =>
	Effect.gen(function* () {
		const error = yield* Effect.flip(validateManifest(m, manifest, patched));
		assert.strictEqual(error._tag, "ManifestValidationError");
		assert.strictEqual(error.marketplace, m.id);
		assert.strictEqual(error.path, m.path);
		return error.errors;
	});

/** Fail `manifest` and assert some reason contains `needle`. */
const rejects = (manifest: string, patched: ReadonlyArray<string>, needle: string, m = CLAUDE_CODE) =>
	Effect.gen(function* () {
		const errors = yield* reasons(manifest, patched, m);
		assert.isTrue(
			errors.some((e) => e.includes(needle)),
			`expected a reason containing ${JSON.stringify(needle)}, got ${JSON.stringify(errors)}`,
		);
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
			rejects(withSource({ sha: "zzz" }), ["p1"], "source.sha must be 40-hex lowercase"),
		);

		it.effect("rejects an uppercase sha", () =>
			rejects(withSource({ sha: "A".repeat(40) }), ["p1"], "source.sha must be 40-hex lowercase"),
		);

		// The host guard. Without it a patch can re-point a plugin at any origin
		// the runner can reach, which is the one semantic rule here with a
		// security consequence rather than a correctness one.
		it.effect("rejects a non-GitHub url", () =>
			rejects(withSource({ url: "https://evil.example.com/acme/p1" }), ["p1"], "source.url must be a GitHub URL"),
		);

		it.effect("rejects a github.com lookalike host", () =>
			rejects(withSource({ url: "https://github.com.evil.test/acme/p1" }), ["p1"], "source.url must be a GitHub URL"),
		);

		it.effect("rejects a plain-http GitHub url", () =>
			rejects(withSource({ url: "http://github.com/acme/p1" }), ["p1"], "source.url must be a GitHub URL"),
		);

		it.effect("rejects an empty path", () =>
			rejects(withSource({ path: "" }), ["p1"], "source.path must be non-empty"),
		);

		it.effect("rejects a source kind other than git-subdir", () =>
			rejects(withSource({ source: "github-release" }), ["p1"], 'source.source must be "git-subdir"'),
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
		rejects(good, ["ghost"], "patched plugin not present after edit: ghost"),
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

describe("validateManifest (copilot)", () => {
	it.effect("accepts a well-formed github source", () =>
		validateManifest(COPILOT, manifestWith(COPILOT_SOURCE), ["p1"]),
	);

	it.effect("accepts a github source without a path", () =>
		validateManifest(COPILOT, manifestWith({ source: "github", repo: "acme/p1", sha: "a".repeat(40) }), ["p1"]),
	);

	it.effect("accepts a github source that also carries a ref", () =>
		validateManifest(COPILOT, manifestWith({ ...COPILOT_SOURCE, ref: "v1.0.0" }), ["p1"]),
	);

	describe("structural", () => {
		it.effect("rejects a manifest without owner", () =>
			rejects(
				JSON.stringify({ name: "acme", plugins: [{ name: "p1", source: COPILOT_SOURCE }] }),
				["p1"],
				"owner",
				COPILOT,
			),
		);

		it.effect("rejects a plugin without source", () =>
			rejects(
				JSON.stringify({ name: "acme", owner: { name: "Acme" }, plugins: [{ name: "p1" }] }),
				[],
				"source",
				COPILOT,
			),
		);
	});

	describe("semantic, on an otherwise valid manifest", () => {
		it.effect("rejects a bare path-string source on a patched entry", () =>
			rejects(manifestWith("plugins/p1"), ["p1"], 'source.source must be "github"', COPILOT),
		);

		it.effect("rejects a url source on a patched entry", () =>
			rejects(
				manifestWith({ source: "url", url: "https://example.com/p.tgz", sha: "a".repeat(40) }),
				["p1"],
				'source.source must be "github"',
				COPILOT,
			),
		);

		it.effect("rejects a repo that is not owner/name", () =>
			rejects(
				manifestWith({ ...COPILOT_SOURCE, repo: "https://github.com/acme/p1" }),
				["p1"],
				"source.repo must be owner/name",
				COPILOT,
			),
		);

		it.effect("rejects an empty path when present", () =>
			rejects(
				manifestWith({ ...COPILOT_SOURCE, path: "" }),
				["p1"],
				"source.path must be non-empty when present",
				COPILOT,
			),
		);

		it.effect("rejects a non-40-hex sha", () =>
			rejects(manifestWith({ ...COPILOT_SOURCE, sha: "abc" }), ["p1"], "source.sha must be 40-hex lowercase", COPILOT),
		);

		it.effect("ignores an untouched string-source entry", () =>
			validateManifest(COPILOT, manifestWith("plugins/p1"), []),
		);
	});
});
