import { describe, expect, it } from "vitest";
import type { ChangeRecord } from "../../src/schema/marketplace.js";
import type { ProjectionInput } from "../../src/schema/projections.js";
import { toReportOutput } from "../../src/schema/projections.js";
import { SCHEMA_URL } from "../../src/schema/report-output.js";

const CLAUDE_PATH = ".claude-plugin/marketplace.json";
const COPILOT_PATH = ".github/plugin/marketplace.json";

/** A claude-code `sha` change to `p1`; override any field. */
const record = (overrides: Partial<ChangeRecord> = {}): ChangeRecord => ({
	marketplace: "claude-code",
	path: CLAUDE_PATH,
	pluginName: "p1",
	manifestName: "acme",
	field: "sha",
	value: "s",
	...overrides,
});

/** A successful commit-mode run that landed nothing; override any field. */
const project = (overrides: Partial<ProjectionInput> = {}) =>
	toReportOutput({
		mode: "commit",
		dryRun: false,
		changes: [],
		commitSha: null,
		commitUrl: null,
		prNumber: null,
		prUrl: null,
		succeeded: true,
		hasFailures: false,
		...overrides,
	});

describe("toReportOutput", () => {
	it("marks a no-op when nothing changed", () => {
		const out = project();
		expect(out.$schema).toBe(SCHEMA_URL);
		// The version lives in the $schema URL's path; there is no in-band copy.
		expect(Object.hasOwn(out, "schemaVersion")).toBe(false);
		expect(out.noop).toBe(true);
		expect(out.status).toBe("no-op");
		expect(out.pluginsUpdated).toBe(0);
	});

	it("reports success with a commit sha", () => {
		const out = project({ changes: [record()], commitSha: "abc", commitUrl: "http://c" });
		expect(out.noop).toBe(false);
		expect(out.succeeded).toBe(true);
		expect(out.status).toBe("success");
		expect(out.pluginsUpdated).toBe(1);
		expect(out.commit?.sha).toBe("abc");
	});

	it("groups multiple distinct plugins, preserving first-seen order and count", () => {
		const out = project({
			changes: [record({ pluginName: "b", value: "s2" }), record({ pluginName: "a", field: "path", value: "./a" })],
			commitSha: "abc",
		});
		expect(out.pluginsUpdated).toBe(2);
		expect(out.plugins.map((p) => p.name)).toEqual(["b", "a"]);
		expect(out.plugins[0]?.fields).toEqual(["sha"]);
		expect(out.plugins[1]?.fields).toEqual(["path"]);
	});

	it("accumulates multiple fields for the same plugin into one entry", () => {
		const out = project({
			changes: [record(), record({ field: "path", value: "./p" })],
			commitSha: "abc",
		});
		expect(out.pluginsUpdated).toBe(1);
		expect(out.plugins).toHaveLength(1);
		expect(out.plugins[0]?.name).toBe("p1");
		expect(out.plugins[0]?.fields).toEqual(["sha", "path"]);
	});

	it("reports the pr branch with pr populated and commit null", () => {
		const out = project({ mode: "pr", changes: [record()], prNumber: 42, prUrl: "http://pr" });
		expect(out.mode).toBe("pr");
		expect(out.status).toBe("success");
		expect(out.commit).toBeNull();
		expect(out.pr).toEqual({ number: 42, url: "http://pr" });
	});

	it("reports status failed when succeeded is false and hasFailures is true", () => {
		const out = project({ changes: [record()], succeeded: false, hasFailures: true });
		expect(out.status).toBe("failed");
		expect(out.succeeded).toBe(false);
		expect(out.hasFailures).toBe(true);
		expect(out.noop).toBe(false);
	});

	it("reports status failed with no changes when succeeded is false and hasFailures is true", () => {
		const out = project({ succeeded: false, hasFailures: true });
		expect(out.status).toBe("failed");
		expect(out.succeeded).toBe(false);
		expect(out.hasFailures).toBe(true);
		expect(out.pluginsUpdated).toBe(0);
	});

	it("keeps one name in two marketplaces as two entries and lists both manifests", () => {
		const claude = record({ pluginName: "effected", manifestName: "spencerbeggs" });
		const copilot = { ...claude, marketplace: "copilot" as const, path: COPILOT_PATH };
		const out = project({
			changes: [claude, copilot, { ...copilot, field: "path", value: "plugins/copilot" }],
			commitSha: "abc",
		});
		expect(out.pluginsUpdated).toBe(2);
		expect(out.plugins).toEqual([
			{ marketplace: "claude-code", manifest: CLAUDE_PATH, name: "effected", fields: ["sha"] },
			{ marketplace: "copilot", manifest: COPILOT_PATH, name: "effected", fields: ["sha", "path"] },
		]);
		expect(out.manifests).toEqual([CLAUDE_PATH, COPILOT_PATH]);
	});

	it("reports no manifests for a no-op", () => {
		expect(project().manifests).toEqual([]);
	});
});
