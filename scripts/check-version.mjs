import { readFileSync } from "node:fs";

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
	console.error(`Version check failed: ${message}`);
	process.exit(1);
}

const pkg = readJson("package.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

if (typeof pkg.version !== "string" || !pkg.version) {
	fail("package.json is missing a valid version.");
}

if (manifest.version !== pkg.version) {
	fail(`manifest.json version (${manifest.version}) does not match package.json (${pkg.version}).`);
}

if (typeof manifest.minAppVersion !== "string" || !manifest.minAppVersion) {
	fail("manifest.json is missing minAppVersion.");
}

if (versions[pkg.version] !== manifest.minAppVersion) {
	fail(
		`versions.json entry for ${pkg.version} must be ${manifest.minAppVersion}, got ${String(versions[pkg.version])}.`,
	);
}

console.log(`Version check passed for ${pkg.version}.`);
