import { Jsonc } from "@effected/jsonc";
import { Brand, Effect } from "effect";
import { ManifestValidationError } from "../errors/errors.js";
import type { Marketplace } from "../marketplaces.js";
import type { MarketplaceId } from "../schema/input.js";
import type { ChangeRecord } from "../schema/marketplace.js";
import type { ChangedEdit } from "./ManifestEditor.js";

interface RawPlugin {
	readonly name?: unknown;
	readonly source?: unknown;
}

const semanticErrors = (m: Marketplace, parsed: unknown, patchedNames: ReadonlyArray<string>): Array<string> => {
	const errors: Array<string> = [];
	const plugins = (parsed as { plugins?: Array<RawPlugin> }).plugins ?? [];
	const names = plugins.map((p) => (typeof p.name === "string" ? p.name : ""));

	const seen = new Set<string>();
	for (const n of names) {
		if (n === "") {
			continue; // nameless plugins are a structural error, not a duplicate
		}
		if (seen.has(n)) {
			errors.push(`duplicate plugin name: ${n}`);
		}
		seen.add(n);
	}
	for (const n of patchedNames) {
		if (!names.includes(n)) {
			errors.push(`patched plugin not present after edit: ${n}`);
		}
	}
	for (const p of plugins) {
		const name = typeof p.name === "string" ? p.name : "";
		if (!patchedNames.includes(name)) {
			continue; // only re-check plugins we touched
		}
		errors.push(...m.sourceErrors(name, p.source));
	}
	return errors;
};

/**
 * Validate an edited manifest of marketplace `m` structurally (ajv, the kind's
 * schema) and semantically (the kind's source rules, for touched plugins).
 * Fails with every reason at once.
 */
export const validateManifest = (
	m: Marketplace,
	editedText: string,
	patchedNames: ReadonlyArray<string>,
): Effect.Effect<void, ManifestValidationError> =>
	Effect.gen(function* () {
		const fail = (errors: ReadonlyArray<string>) =>
			new ManifestValidationError({ marketplace: m.id, path: m.path, errors });
		const parsed = yield* Jsonc.parse(editedText).pipe(
			Effect.mapError(() => fail(["resulting manifest is not valid JSON/JSONC"])),
		);
		const errors: Array<string> = [];
		if (!m.validateStructural(parsed)) {
			for (const e of m.validateStructural.errors ?? []) {
				errors.push(`${e.instancePath || "/"} ${e.message ?? "invalid"}`);
			}
		}
		errors.push(...semanticErrors(m, parsed, patchedNames));
		if (errors.length > 0) {
			return yield* Effect.fail(fail(errors));
		}
	});

/**
 * A manifest edit proven to both differ from the original and pass validation.
 *
 * Minted only by {@link validateEdit}, and required by
 * `ManifestCommitter.land` — so "commit unvalidated or byte-stable text" is a
 * compile error rather than an ordering discipline `program.ts` has to uphold.
 * It carries the marketplace and path it was validated as, so `land` writes the
 * text to the file whose rules it passed and nowhere else.
 */
export type ValidatedManifestChange = Brand.Branded<
	{
		readonly marketplace: MarketplaceId;
		readonly path: string;
		readonly editedText: string;
		readonly changes: ReadonlyArray<ChangeRecord>;
	},
	"ValidatedManifestChange"
>;

const ValidatedManifestChange = Brand.nominal<ValidatedManifestChange>();

/**
 * Validate a changed edit against marketplace `m` and, on success, mint the
 * {@link ValidatedManifestChange} that `land` requires.
 */
export const validateEdit = (
	m: Marketplace,
	edit: ChangedEdit,
	patchedNames: ReadonlyArray<string>,
): Effect.Effect<ValidatedManifestChange, ManifestValidationError> =>
	Effect.map(validateManifest(m, edit.editedText, patchedNames), () =>
		ValidatedManifestChange({ marketplace: m.id, path: m.path, editedText: edit.editedText, changes: edit.changes }),
	);
