import { describe, expect, it } from "vitest";
import { buildSummary, commitSubject, defaultCommitMessage, messageBody } from "../src/report.js";
import { toReportOutput } from "../src/schema/projections.js";

const PATHS = { "claude-code": ".claude-plugin/marketplace.json", copilot: ".github/plugin/marketplace.json" } as const;

const c = (
	pluginName: string,
	field: "path" | "sha",
	value: string,
	marketplace: "claude-code" | "copilot" = "claude-code",
) => ({ marketplace, path: PATHS[marketplace], pluginName, manifestName: "savvy-web-systems", field, value });

describe("message generation", () => {
	it("single-pair subject names the marketplace", () => {
		expect(commitSubject([c("plugin-bot", "sha", "19619a3", "copilot")])).toBe(
			"ai(marketplace): repinned plugin-bot@savvy-web-systems (copilot)",
		);
	});

	it("one name across both marketplaces gets a combined subject", () => {
		expect(commitSubject([c("effected", "sha", "1"), c("effected", "sha", "1", "copilot")])).toBe(
			"ai(marketplace): repinned effected@savvy-web-systems (claude-code, copilot)",
		);
	});

	it("same plugin name but a different manifestName in each marketplace is not a combined subject", () => {
		const claude = c("effected", "sha", "1");
		const copilot = { ...c("effected", "sha", "1", "copilot"), manifestName: "other-repo" };
		expect(commitSubject([claude, copilot])).toBe("ai(marketplace): repinned 2 plugins");
	});

	it("otherwise counts distinct (marketplace, name) pairs", () => {
		expect(commitSubject([c("a", "sha", "1"), c("a", "path", "p"), c("b", "sha", "2", "copilot")])).toBe(
			"ai(marketplace): repinned 2 plugins",
		);
	});

	it("body has one marketplace-tagged bullet per field", () => {
		expect(messageBody([c("silk", "sha", "19619a3"), c("plugin-bot", "path", "plugins/foobar", "copilot")])).toBe(
			"- [claude-code] pinned silk@savvy-web-systems to 19619a3\n" +
				"- [copilot] changed path of plugin-bot@savvy-web-systems to plugins/foobar",
		);
	});

	it("commit message appends a DCO trailer after a blank line", () => {
		const msg = defaultCommitMessage([c("silk", "sha", "abc")], {
			name: "plugin-bot[bot]",
			email: "209691739+plugin-bot[bot]@users.noreply.github.com",
		});
		expect(msg).toBe(
			"ai(marketplace): repinned silk@savvy-web-systems (claude-code)\n\n" +
				"- [claude-code] pinned silk@savvy-web-systems to abc\n\n" +
				"Signed-off-by: plugin-bot[bot] <209691739+plugin-bot[bot]@users.noreply.github.com>",
		);
	});

	it("summary lists touched manifests and tags each plugin with its marketplace", () => {
		const summary = buildSummary(
			toReportOutput({
				mode: "commit",
				dryRun: false,
				changes: [c("effected", "sha", "1"), c("effected", "sha", "1", "copilot")],
				commitSha: "abc",
				commitUrl: null,
				prNumber: null,
				prUrl: null,
				succeeded: true,
				hasFailures: false,
			}),
		);
		expect(summary).toContain(".claude-plugin/marketplace.json, .github/plugin/marketplace.json");
		expect(summary).toContain("`effected` (claude-code) — sha");
		expect(summary).toContain("`effected` (copilot) — sha");
	});
});
