#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { cancel, isCancel, multiselect, note, select } from "@clack/prompts";
import pino from "pino";
import {
	cacheKey,
	clearCache,
	loadCache,
	sortByRecent,
	updateCache,
} from "./src/cache.ts";
import { DomainPrimitive } from "./src/primitives/domain.ts";
import { SkillPrimitive } from "./src/primitives/skill.ts";
import type { ParsedArgs, Primitive, PrimitiveItem } from "./src/types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

const logger = pino(
	{ level: "trace" },
	{
		write(chunk: string) {
			const obj = JSON.parse(chunk);
			process.stdout.write(`${obj.msg}\n`);
			if (obj.err?.stack) {
				process.stderr.write(`${obj.err.stack}\n`);
			}
		},
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// Primitives registry
// ─────────────────────────────────────────────────────────────────────────────

const primitives: Primitive[] = [new SkillPrimitive(), new DomainPrimitive()];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DANGEROUS_MODE = process.env.AGENT_PRIMER_DANGEROUS === "1";

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2);

	const result: ParsedArgs = {
		help: false,
		clearRecent: false,
		list: false,
		dangerousMode: DANGEROUS_MODE,
		claudeArgs: [],
	};

	const separator = args.indexOf("--");
	if (separator !== -1) {
		result.claudeArgs.push(...args.slice(separator + 1));
	}

	const flagArgs = separator === -1 ? args : args.slice(0, separator);
	for (const arg of flagArgs) {
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--clear-recent") {
			result.clearRecent = true;
		} else if (arg === "--list" || arg === "-l") {
			result.list = true;
		} else {
			result.claudeArgs.push(arg);
		}
	}

	return result;
}

function printHelp(dangerousMode: boolean): void {
	const cmd = dangerousMode ? "apx" : "ap";
	const dangerousNote = dangerousMode
		? "\nDANGEROUS MODE: --dangerously-skip-permissions is auto-enabled\n"
		: "";

	logger.info(`
agent-primer (${cmd}) - Prime your Agent sessions with preloaded primitives
${dangerousNote}
USAGE:
  ap [options] [-- claude-options]       Standard mode
  apx [options] [-- claude-options]      Dangerous mode (skips permissions)

OPTIONS:
  -h, --help        Show this help message
  -l, --list        List available primitives and exit
  --clear-recent    Clear the recent selections cache

CLAUDE OPTIONS:
  All other options are passed directly to Claude. Use -- to explicitly
  separate agent-primer options from Claude options.

EXAMPLES:
  ap                          Interactive primitive selection
  ap --list                   List all available primitives
  ap -- --model opus          Use Opus model
  ap -- -p "prompt"           Run with a prompt (non-interactive)
  apx                         Skip all permission prompts

PRIMITIVE LOCATIONS:
  Skills:   ~/.claude/skills/    ./.claude/skills/
  Domains:  ~/.claude/domains/   ./.claude/domains/
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Process spawning
// ─────────────────────────────────────────────────────────────────────────────

function spawnClaude(args: string[]): void {
	// Put terminal in raw mode before spawning to suppress echo of stray
	// escape sequences (like ^[[I focus events) during Claude's startup.
	// Claude's TUI will set its own terminal mode once it initializes.
	if (process.stdin.isTTY) process.stdin.setRawMode(true);

	const claude = spawn("claude", args, { stdio: "inherit" });
	claude.on("exit", (code) => process.exit(code || 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs(process.argv);

	if (args.help) {
		printHelp(args.dangerousMode);
		process.exit(0);
	}

	if (args.dangerousMode) {
		logger.warn("DANGEROUS MODE: Permission checks will be skipped\n");
	}

	if (args.clearRecent) {
		try {
			if (clearCache()) {
				logger.info("Recent selections cache cleared");
			} else {
				logger.info("No recent selections cache to clear");
			}
		} catch (error) {
			logger.error({ err: error }, "Failed to clear cache");
		}
		process.exit(0);
	}

	// Discover all items from all primitives
	const allItems = primitives.flatMap((p) => p.discoverItems());

	if (allItems.length === 0) {
		logger.warn("No primitives found. Check your directories:");
		logger.warn("  Skills:   ~/.claude/skills/    ./.claude/skills/");
		logger.warn("  Domains:  ~/.claude/domains/   ./.claude/domains/");
		process.exit(1);
	}

	// Load recent cache once and sort items
	const cache = loadCache();
	const recentKeys = new Set(Object.keys(cache.recent));
	const sortedItems = sortByRecent(allItems, cache);

	// Build counts per primitive type
	const typeCounts = Map.groupBy(allItems, (i) => i.type);
	const countLines = [...typeCounts.entries()]
		.map(([type, items]) => {
			const primitive = primitives.find((p) => p.type === type);
			const label = (primitive?.label || type).toLowerCase();
			return `${items.length} ${label}`;
		})
		.join("  |  ");

	if (args.list) {
		const hasMultipleTypes = new Set(allItems.map((i) => i.type)).size > 1;

		logger.info(`Found ${allItems.length} primitive(s):\n`);

		if (hasMultipleTypes) {
			// Group by type
			const byType = Map.groupBy(sortedItems, (i) => i.type);
			for (const [type, items] of byType) {
				const primitive = primitives.find((p) => p.type === type);
				logger.info(`${primitive?.label || type}:`);
				for (const item of items) {
					const isRecent = recentKeys.has(cacheKey(item));
					const prefix = isRecent ? "*" : " ";
					logger.info(`${prefix} [${item.source}] ${item.name}`);
					logger.info(
						`    ${item.description.slice(0, 70)}${item.description.length > 70 ? "..." : ""}`,
					);
				}
				logger.info("");
			}
		} else {
			for (const item of sortedItems) {
				const isRecent = recentKeys.has(cacheKey(item));
				const prefix = isRecent ? "*" : " ";
				logger.info(`${prefix} [${item.source}] ${item.name}`);
				logger.info(
					`    ${item.description.slice(0, 70)}${item.description.length > 70 ? "..." : ""}`,
				);
			}
		}
		process.exit(0);
	}

	const dangerousArgs = args.dangerousMode
		? ["--dangerously-skip-permissions"]
		: [];

	// Selection loop - restarts on "No" at confirmation
	let selectedItems: PrimitiveItem[] = [];

	while (true) {
		console.log(`\n  \x1b[1m\x1b[7m Agent Primer \x1b[0m\n`);
		console.log(`  ${countLines}\n`);

		// Present a separate picker per primitive type
		selectedItems = [];
		const sortedByType = Map.groupBy(sortedItems, (i) => i.type);

		for (const [type, items] of sortedByType) {
			const primitive = primitives.find((p) => p.type === type);
			const label = primitive?.label || type;

			const options = items.map((item) => {
				const isRecent = recentKeys.has(cacheKey(item));
				return {
					value: item,
					label: `[${item.source}] ${item.name}`,
					hint: isRecent ? "recent" : undefined,
				};
			});

			const selected = await multiselect({
				message: `\x1b[1m\x1b[7m ${label} \x1b[0m`,
				options,
				required: false,
			});

			if (isCancel(selected)) {
				cancel("Cancelled");
				process.exit(0);
			}

			selectedItems.push(...(selected as PrimitiveItem[]));
		}

		// Show summary and ask for confirmation
		if (selectedItems.length === 0) {
			console.log("\n  No primitives selected.\n");
		} else {
			const summary = selectedItems
				.map((item) => `  ${item.name} (${item.source})`)
				.join("\n");
			console.log(`\n  Selected:\n${summary}\n`);
		}

		const confirmation = await select({
			message: "\x1b[1m\x1b[7m Confirm \x1b[0m",
			options: [
				{ value: "yes", label: "Yes, launch agent" },
				{ value: "no", label: "No, start over" },
				{ value: "exit", label: "Exit" },
			],
		});

		if (isCancel(confirmation) || confirmation === "exit") {
			cancel("Cancelled");
			process.exit(0);
		}

		if (confirmation === "yes") break;
	}

	if (selectedItems.length === 0) {
		logger.info(
			"No primitives selected. Launching Claude without preloaded context...\n",
		);
		spawnClaude([...dangerousArgs, ...args.claudeArgs]);
		return;
	}

	updateCache(selectedItems);

	// Group selected items by type, load content, format prompts
	const selectedByType = Map.groupBy(selectedItems, (i) => i.type);
	const promptSections: string[] = [];

	for (const [type, items] of selectedByType) {
		const primitive = primitives.find((p) => p.type === type);
		if (!primitive) continue;

		const contents = items.map((item) => primitive.loadContent(item));
		promptSections.push(primitive.formatForPrompt(contents));
	}

	const systemPrompt = promptSections.join("\n\n");

	const estimatedTokens = Math.ceil(systemPrompt.length / 4);
	const launchSummary = selectedItems
		.map((item) => `  ${item.name} (${item.source})`)
		.join("\n");
	note(
		`${launchSummary}\n\n  ~${estimatedTokens.toLocaleString()} tokens`,
		"Launching Claude with",
	);

	spawnClaude([
		...dangerousArgs,
		"--append-system-prompt",
		systemPrompt,
		...args.claudeArgs,
	]);
}

main().catch((error) => {
	logger.fatal({ err: error }, "Unhandled error");
	process.exit(1);
});
