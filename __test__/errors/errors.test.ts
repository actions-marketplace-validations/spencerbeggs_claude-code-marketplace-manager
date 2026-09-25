import { describe, expect, it } from "vitest";
import {
	InvalidInputError,
	ManifestNotFoundError,
	ManifestValidationError,
	PluginNotFoundError,
} from "../../src/errors/errors.js";

describe("errors", () => {
	it("InvalidInputError renders field + reason", () => {
		const e = new InvalidInputError({ field: "json", reason: "not an array" });
		expect(e._tag).toBe("InvalidInputError");
		expect(e.message).toBe("Invalid input (json): not an array");
	});

	it("PluginNotFoundError names the plugin and the manifest", () => {
		expect(
			new PluginNotFoundError({ marketplace: "copilot", path: ".github/plugin/marketplace.json", name: "ghost" })
				.message,
		).toBe("Plugin not found in .github/plugin/marketplace.json (copilot): ghost");
	});

	it("ManifestNotFoundError names the marketplace and path", () => {
		const e = new ManifestNotFoundError({ marketplace: "copilot", path: ".github/plugin/marketplace.json" });
		expect(e._tag).toBe("ManifestNotFoundError");
		expect(e.message).toBe("Marketplace manifest not found for copilot: .github/plugin/marketplace.json");
	});

	it("ManifestValidationError names the manifest and joins the reasons", () => {
		const e = new ManifestValidationError({
			marketplace: "copilot",
			path: ".github/plugin/marketplace.json",
			errors: ["a", "b"],
		});
		expect(e.message).toBe("Manifest validation failed (copilot: .github/plugin/marketplace.json):\na\nb");
	});
});
