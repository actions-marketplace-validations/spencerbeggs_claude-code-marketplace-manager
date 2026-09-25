import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { decodeJsonInput } from "../../src/schema/input.js";

const SHA = "1".repeat(40);

/** Decode a one-patch envelope: a copilot repin of `a`, extended by `extra`. */
const decodeCopilot = (extra: Record<string, unknown>) =>
	decodeJsonInput({ plugins: [{ name: "a", marketplace: "copilot", sha: SHA, ...extra }] });

describe("json input schema", () => {
	it.effect("decodes a plugins envelope of v2 patches", () =>
		Effect.gen(function* () {
			const parsed = yield* decodeJsonInput({
				plugins: [
					{ name: "a", marketplace: "claude-code", sha: SHA },
					{ name: "a", marketplace: "copilot", sha: SHA, path: "plugins/copilot" },
				],
			});
			assert.deepStrictEqual(parsed.plugins, [
				{ name: "a", marketplace: "claude-code", sha: SHA },
				{ name: "a", marketplace: "copilot", sha: SHA, path: "plugins/copilot" },
			]);
			assert.isFalse(Object.hasOwn(parsed.plugins[0], "path"));
		}),
	);

	it.effect("rejects a bare array (no plugins envelope)", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput([{ name: "a", marketplace: "claude-code", sha: SHA }]));
		}),
	);

	it.effect("rejects an empty plugins array", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput({ plugins: [] }));
		}),
	);

	it.effect("rejects a patch without a marketplace", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput({ plugins: [{ name: "a", sha: SHA }] }));
		}),
	);

	it.effect("rejects an unknown marketplace", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput({ plugins: [{ name: "a", marketplace: "cursor", sha: SHA }] }));
		}),
	);

	it.effect("rejects a patch without a sha", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput({ plugins: [{ name: "a", marketplace: "copilot" }] }));
		}),
	);

	it.effect("rejects a sha that is not 40-hex lowercase", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeJsonInput({ plugins: [{ name: "a", marketplace: "copilot", sha: "A".repeat(40) }] }));
		}),
	);

	it.effect("rejects an absolute or empty path", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeCopilot({ path: "/abs" }));
			yield* Effect.flip(decodeCopilot({ path: "" }));
		}),
	);

	it.effect("rejects a path carrying a control character, a `..` segment, or a backslash", () =>
		Effect.gen(function* () {
			yield* Effect.flip(decodeCopilot({ path: "\nCo-authored-by: x" }));
			yield* Effect.flip(decodeCopilot({ path: "a/../b" }));
			yield* Effect.flip(decodeCopilot({ path: ".." }));
			yield* Effect.flip(decodeCopilot({ path: "a\\b" }));
		}),
	);

	it.effect("accepts an ordinary relative path, including a leading-dot segment that is not `..`", () =>
		Effect.gen(function* () {
			yield* decodeCopilot({ path: "plugins/copilot" });
			yield* decodeCopilot({ path: "plugin" });
			yield* decodeCopilot({ path: "a/.b/c" });
		}),
	);

	it.effect("rejects excess keys such as the removed url field", () =>
		Effect.gen(function* () {
			yield* Effect.flip(
				decodeJsonInput({ plugins: [{ name: "a", marketplace: "claude-code", sha: SHA, url: "https://x" }] }),
			);
		}),
	);
});
