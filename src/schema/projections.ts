import type { ChangeRecord } from "./marketplace.js";
import type { ReportOutput, ResultStatus } from "./report-output.js";
import { SCHEMA_URL } from "./report-output.js";

/** Inputs to the pure output projection. */
export interface ProjectionInput {
	readonly mode: "commit" | "pr";
	readonly dryRun: boolean;
	readonly changes: ReadonlyArray<ChangeRecord>;
	readonly commitSha: string | null;
	readonly commitUrl: string | null;
	readonly prNumber: number | null;
	readonly prUrl: string | null;
	readonly succeeded: boolean;
	readonly hasFailures: boolean;
}

const deriveStatus = (noop: boolean, succeeded: boolean): ResultStatus =>
	!succeeded ? "failed" : noop ? "no-op" : "success";

type Field = "path" | "sha";
type ChangedPlugin = ReportOutput["plugins"][number];

/**
 * Group flat change records into one entry per `(marketplace, name)`,
 * preserving first-seen order. Keyed on the pair, not the name: one plugin is
 * routinely repinned in both marketplaces in the same run, and those are two
 * entries in two files.
 */
const groupPlugins = (changes: ReadonlyArray<ChangeRecord>): ReadonlyArray<ChangedPlugin> => {
	const order: Array<string> = [];
	const byKey = new Map<string, { head: ChangeRecord; fields: Array<Field> }>();
	for (const c of changes) {
		const key = `${c.marketplace}\u0000${c.pluginName}`;
		let entry = byKey.get(key);
		if (entry === undefined) {
			entry = { head: c, fields: [] };
			byKey.set(key, entry);
			order.push(key);
		}
		entry.fields.push(c.field);
	}
	return order.flatMap((key) => {
		const entry = byKey.get(key);
		return entry === undefined
			? []
			: [
					{
						marketplace: entry.head.marketplace,
						manifest: entry.head.path,
						name: entry.head.pluginName,
						fields: entry.fields,
					},
				];
	});
};

/** Distinct manifest paths the changes touched, first-seen order. */
const touchedManifests = (changes: ReadonlyArray<ChangeRecord>): ReadonlyArray<string> => [
	...new Set(changes.map((c) => c.path)),
];

/** Project the applied-change set and land outcome into the `result` struct. Pure. */
export const toReportOutput = (input: ProjectionInput): ReportOutput => {
	const plugins = groupPlugins(input.changes);
	const noop = input.changes.length === 0;
	return {
		$schema: SCHEMA_URL,
		mode: input.mode,
		status: deriveStatus(noop, input.succeeded),
		noop,
		succeeded: input.succeeded,
		hasFailures: input.hasFailures,
		dryRun: input.dryRun,
		pluginsUpdated: plugins.length,
		plugins,
		manifests: touchedManifests(input.changes),
		commit: input.commitSha === null ? null : { sha: input.commitSha, url: input.commitUrl },
		pr: input.prNumber === null ? null : { number: input.prNumber, url: input.prUrl },
	};
};
