import { Schema } from "effect";
import type { MarketplaceId } from "./input.js";

/** A single plugin entry; `source` is kept loose so non-git-subdir sources decode too. */
export const MarketplacePlugin = Schema.Struct({
	name: Schema.String,
	source: Schema.Unknown,
});

/**
 * The subset of the marketplace manifest this action reads: the manifest `name`
 * and the ordered `plugins[]`. Extra top-level keys (`owner`, `metadata`) are
 * ignored on decode.
 */
export const MarketplaceManifest = Schema.Struct({
	name: Schema.String,
	plugins: Schema.Array(MarketplacePlugin),
});

/** Decoded marketplace manifest shape. */
export type MarketplaceManifest = typeof MarketplaceManifest.Type;

/** Decode an already-parsed JS value into the {@link MarketplaceManifest} read shape. */
export const decodeMarketplace = Schema.decodeUnknownEffect(MarketplaceManifest);

/** One applied field change, used by projections and the message/report builders. */
export interface ChangeRecord {
	readonly marketplace: MarketplaceId;
	/** Manifest file the change was written to. */
	readonly path: string;
	readonly pluginName: string;
	readonly manifestName: string;
	readonly field: "path" | "sha";
	readonly value: string;
}

/**
 * Identity of one plugin entry across manifests: the `(marketplace, name)`
 * pair. One name routinely appears in both marketplaces, and those are two
 * entries in two files.
 */
export const pluginKey = (marketplace: MarketplaceId, name: string): string => `${marketplace}\u0000${name}`;
