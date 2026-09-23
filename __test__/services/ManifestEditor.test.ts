import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { CLAUDE_CODE, COPILOT } from "../../src/marketplaces.js";
import { applyPatches, readManifest } from "../../src/services/ManifestEditor.js";

const MANIFEST = `{
	// marketplace
	"name": "acme",
	"plugins": [
		{ "name": "p1", "source": { "source": "git-subdir", "url": "https://github.com/acme/p1", "path": "plugin", "sha": "0000000000000000000000000000000000000000" } }
	]
}
`;

describe("applyPatches", () => {
	it.effect("updates only the provided field and preserves the comment", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: "1111111111111111111111111111111111111111" },
			]);
			assert.isTrue(result.changed);
			assert.strictEqual(result.manifestName, "acme");
			assert.include(result.editedText, "1111111111111111111111111111111111111111");
			assert.include(result.editedText, "// marketplace");
			assert.include(result.editedText, '"path": "plugin"');
			assert.deepStrictEqual(result.changes, [
				{
					marketplace: "claude-code",
					path: ".claude-plugin/marketplace.json",
					pluginName: "p1",
					manifestName: "acme",
					field: "sha",
					value: "1111111111111111111111111111111111111111",
				},
			]);
		}),
	);

	it.effect("is a no-op when the value is unchanged", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: "0000000000000000000000000000000000000000" },
			]);
			assert.isFalse(result.changed);
			assert.strictEqual(result.editedText, MANIFEST);
			assert.deepStrictEqual(result.changes, []);
		}),
	);

	it.effect("last-write-wins when two patches target the same plugin+field", () =>
		Effect.gen(function* () {
			// Original sha is 40×"0". Patch 1 sets it to 40×"1" (applied), patch 2 sets
			// it back to 40×"0" (the original value). With the bug, patch 2's
			// "unchanged?" check reads the never-updated original parse, sees
			// "0" === "0", and incorrectly skips — leaving the wrong 40×"1" in the
			// text. Fixed, patch 2 sees the RUNNING state (40×"1") and correctly
			// applies, restoring 40×"0" — which round-trips back to the exact
			// original bytes.
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: "1".repeat(40) },
				{ name: "p1", sha: "0".repeat(40) },
			]);
			assert.include(result.editedText, `"sha": "${"0".repeat(40)}"`);
			assert.notInclude(result.editedText, "1".repeat(40));
			assert.strictEqual(result.editedText, MANIFEST);
			assert.isFalse(result.changed);
			// changes is self-consistent with changed: a byte-stable result never
			// carries the transient intermediate writes that netted out to nothing.
			assert.deepStrictEqual(result.changes, []);
		}),
	);

	it.effect("does not record a duplicate edit for two identical-value patches", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(CLAUDE_CODE, MANIFEST, [
				{ name: "p1", sha: "1".repeat(40) },
				{ name: "p1", sha: "1".repeat(40) },
			]);
			assert.isTrue(result.changed);
			assert.include(result.editedText, `"sha": "${"1".repeat(40)}"`);
			assert.deepStrictEqual(result.changes, [
				{
					marketplace: "claude-code",
					path: ".claude-plugin/marketplace.json",
					pluginName: "p1",
					manifestName: "acme",
					field: "sha",
					value: "1".repeat(40),
				},
			]);
		}),
	);

	it.effect("fails with PluginNotFoundError for an unknown plugin", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(applyPatches(CLAUDE_CODE, MANIFEST, [{ name: "ghost", sha: "1".repeat(40) }]));
			if (error._tag !== "PluginNotFoundError") {
				return assert.fail(error._tag);
			}
			assert.strictEqual(error.marketplace, "claude-code");
			assert.strictEqual(error.path, CLAUDE_CODE.path);
		}),
	);

	it.effect("fails with ManifestValidationError for a JSONC-valid but structurally-invalid manifest", () =>
		Effect.gen(function* () {
			const INVALID_MANIFEST = `{
	"name": "acme",
	"plugins": [
		{ "source": { "source": "git-subdir", "url": "https://github.com/acme/p1", "path": "plugin", "sha": "0000000000000000000000000000000000000000" } }
	]
}
`;
			const error = yield* Effect.flip(
				applyPatches(CLAUDE_CODE, INVALID_MANIFEST, [{ name: "p1", sha: "1111111111111111111111111111111111111111" }]),
			);
			assert.strictEqual(error._tag, "ManifestValidationError");
		}),
	);
});

const COPILOT_MANIFEST = `{
	// copilot marketplace
	"name": "acme",
	"owner": { "name": "Acme" },
	"plugins": [
		{
			"name": "p1",
			"source": {
				"source": "github",
				"repo": "acme/p1",
				"path": "plugins/copilot"
			}
		},
		{ "name": "p2", "source": { "source": "github", "repo": "acme/p2", "sha": "${"0".repeat(40)}" } }
	]
}
`;

describe("applyPatches (copilot)", () => {
	it.effect("adds a sha to an entry that has none, preserving comments and layout", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(COPILOT, COPILOT_MANIFEST, [{ name: "p1", sha: "1".repeat(40) }]);
			assert.isTrue(result.changed);
			assert.include(result.editedText, "// copilot marketplace");
			assert.include(result.editedText, `"sha": "${"1".repeat(40)}"`);
			assert.include(result.editedText, '\t\t\t\t"repo": "acme/p1",');
			assert.deepStrictEqual(result.changes, [
				{
					marketplace: "copilot",
					path: ".github/plugin/marketplace.json",
					pluginName: "p1",
					manifestName: "acme",
					field: "sha",
					value: "1".repeat(40),
				},
			]);
		}),
	);

	it.effect("replaces an existing sha and edits path", () =>
		Effect.gen(function* () {
			const result = yield* applyPatches(COPILOT, COPILOT_MANIFEST, [
				{ name: "p2", sha: "2".repeat(40), path: "plugins/p2" },
			]);
			assert.isTrue(result.changed);
			assert.notInclude(result.editedText, "0".repeat(40));
			assert.include(result.editedText, `"sha": "${"2".repeat(40)}"`);
			assert.include(result.editedText, '"path": "plugins/p2"');
			assert.deepStrictEqual(
				result.changes.map((c) => c.field),
				["path", "sha"],
			);
		}),
	);

	it.effect("fails with PluginNotFoundError naming the copilot manifest", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				applyPatches(COPILOT, COPILOT_MANIFEST, [{ name: "ghost", sha: "1".repeat(40) }]),
			);
			if (error._tag !== "PluginNotFoundError") {
				return assert.fail(error._tag);
			}
			assert.strictEqual(error.marketplace, "copilot");
			assert.strictEqual(error.path, ".github/plugin/marketplace.json");
		}),
	);
});

describe("readManifest", () => {
	it.effect("reads the marketplace's fixed path", () =>
		Effect.gen(function* () {
			const dir = mkdtempSync(join(tmpdir(), "mm-read-"));
			mkdirSync(join(dir, ".github/plugin"), { recursive: true });
			writeFileSync(join(dir, ".github/plugin/marketplace.json"), COPILOT_MANIFEST);
			const cwd = process.cwd();
			const text = yield* Effect.sync(() => process.chdir(dir)).pipe(
				Effect.andThen(readManifest(COPILOT)),
				Effect.ensuring(Effect.sync(() => process.chdir(cwd))),
				Effect.provide(NodeFileSystem.layer),
			);
			assert.strictEqual(text, COPILOT_MANIFEST);
		}),
	);

	it.effect("fails with ManifestNotFoundError when the file is missing", () =>
		Effect.gen(function* () {
			const dir = mkdtempSync(join(tmpdir(), "mm-read-"));
			const cwd = process.cwd();
			const error = yield* Effect.sync(() => process.chdir(dir)).pipe(
				Effect.andThen(readManifest(COPILOT)),
				Effect.ensuring(Effect.sync(() => process.chdir(cwd))),
				Effect.provide(NodeFileSystem.layer),
				Effect.flip,
			);
			assert.strictEqual(error._tag, "ManifestNotFoundError");
		}),
	);
});
