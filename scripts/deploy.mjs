import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TARGET_DIR = path.resolve(
	"/Users/nicodobler/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/.obsidian/plugins/outline-plus/",
);

const SOURCE_DIR = process.cwd();
const REQUIRED_FILES = ["main.js", "manifest.json"];
const OPTIONAL_FILES = ["styles.css"];
const PRESERVE_IN_TARGET = new Set(["data.json"]);

async function ensureReadableFile(filePath) {
	try {
		const stats = await fs.stat(filePath);
		if (!stats.isFile()) {
			throw new Error(`${filePath} is not a file.`);
		}
	} catch (error) {
		throw new Error(`Missing required artifact: ${filePath}`, { cause: error });
	}
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function cleanTargetDirectory() {
	const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
	const allowed = new Set([...REQUIRED_FILES, ...OPTIONAL_FILES, ...PRESERVE_IN_TARGET]);

	await Promise.all(
		entries.map(async (entry) => {
			if (allowed.has(entry.name)) {
				return;
			}

			await fs.rm(path.join(TARGET_DIR, entry.name), { recursive: true, force: true });
		}),
	);
}

async function copyArtifacts() {
	for (const fileName of REQUIRED_FILES) {
		await fs.copyFile(path.join(SOURCE_DIR, fileName), path.join(TARGET_DIR, fileName));
	}

	for (const fileName of OPTIONAL_FILES) {
		const sourceFile = path.join(SOURCE_DIR, fileName);
		const targetFile = path.join(TARGET_DIR, fileName);
		if (await pathExists(sourceFile)) {
			await fs.copyFile(sourceFile, targetFile);
			continue;
		}

		if (await pathExists(targetFile)) {
			await fs.rm(targetFile, { force: true });
		}
	}
}

async function deploy() {
	for (const fileName of REQUIRED_FILES) {
		await ensureReadableFile(path.join(SOURCE_DIR, fileName));
	}

	await fs.mkdir(TARGET_DIR, { recursive: true });
	await cleanTargetDirectory();
	await copyArtifacts();

	console.log(`Deployed ${[...REQUIRED_FILES, ...OPTIONAL_FILES].join(", ")} to:`);
	console.log(TARGET_DIR);
	console.log("Preserved in target (if present): data.json");
}

deploy().catch((error) => {
	console.error("Deploy failed.");
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
