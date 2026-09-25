import { Schema } from "effect";

/** A malformed or contradictory action input, surfaced before any work. */
export class InvalidInputError extends Schema.TaggedError<InvalidInputError>()("InvalidInputError", {
	field: Schema.String,
	reason: Schema.String,
}) {
	get message(): string {
		return `Invalid input (${this.field}): ${this.reason}`;
	}
}

/** A patch named a plugin that does not exist in the target manifest's `plugins[]`. */
export class PluginNotFoundError extends Schema.TaggedError<PluginNotFoundError>()("PluginNotFoundError", {
	marketplace: Schema.String,
	path: Schema.String,
	name: Schema.String,
}) {
	get message(): string {
		return `Plugin not found in ${this.path} (${this.marketplace}): ${this.name}`;
	}
}

/** A patch targeted a marketplace whose manifest file is not in the checkout. */
export class ManifestNotFoundError extends Schema.TaggedError<ManifestNotFoundError>()("ManifestNotFoundError", {
	marketplace: Schema.String,
	path: Schema.String,
}) {
	get message(): string {
		return `Marketplace manifest not found for ${this.marketplace}: ${this.path}`;
	}
}

/** The resulting manifest failed structural or semantic validation. */
export class ManifestValidationError extends Schema.TaggedError<ManifestValidationError>()("ManifestValidationError", {
	marketplace: Schema.String,
	path: Schema.String,
	errors: Schema.Array(Schema.String),
}) {
	get message(): string {
		return `Manifest validation failed (${this.marketplace}: ${this.path}):\n${this.errors.join("\n")}`;
	}
}
