import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { CLAUDE_CODE, COPILOT } from "../../src/marketplaces.js";
import { ReportOutput, SCHEMA_URL } from "../../src/schema/report-output.js";

const base = (manifest: string) => ({
	$schema: SCHEMA_URL,
	mode: "commit",
	status: "success",
	noop: false,
	succeeded: true,
	hasFailures: false,
	dryRun: false,
	pluginsUpdated: 1,
	plugins: [{ marketplace: "claude-code", manifest, name: "a", fields: ["sha"] }],
	manifests: [manifest],
	commit: null,
	pr: null,
});

describe("ReportOutput.plugins[].manifest", () => {
	it.effect("accepts each marketplace descriptor's own manifest path", () =>
		Effect.gen(function* () {
			assert.strictEqual(CLAUDE_CODE.path, ".claude-plugin/marketplace.json");
			assert.strictEqual(COPILOT.path, ".github/plugin/marketplace.json");
			yield* Schema.decodeUnknownEffect(ReportOutput)(base(CLAUDE_CODE.path));
			yield* Schema.decodeUnknownEffect(ReportOutput)(base(COPILOT.path));
		}),
	);

	it.effect("rejects a manifest path that isn't one of the two descriptors' paths", () =>
		Effect.gen(function* () {
			yield* Effect.flip(Schema.decodeUnknownEffect(ReportOutput)(base("some/other/path.json")));
		}),
	);
});
