import {
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import pino from "pino";
import type {
	Primitive,
	PrimitiveContent,
	PrimitiveItem,
	SkillMetadata,
} from "../types.ts";
import { SkillFrontmatterSchema, SkillMetadataSchema } from "../types.ts";

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

const GLOBAL_SKILLS_DIR = join(homedir(), ".claude", "skills");
const LOCAL_SKILLS_DIR = join(process.cwd(), ".claude", "skills");

function discoverSkillPaths(dir: string): string[] {
	if (!existsSync(dir)) return [];

	const entries = readdirSync(dir, { withFileTypes: true });
	const paths: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		let realPath = fullPath;
		if (entry.isSymbolicLink()) {
			try {
				realPath = realpathSync(fullPath);
			} catch {
				continue;
			}
		}

		const stat = statSync(realPath, { throwIfNoEntry: false });
		if (stat?.isDirectory()) {
			const skillFile = join(realPath, "SKILL.md");
			if (existsSync(skillFile)) {
				paths.push(skillFile);
			}
		} else if (entry.name === "SKILL.md") {
			paths.push(fullPath);
		}
	}

	return paths;
}

function parseSkill(
	skillPath: string,
	source: "global" | "local",
): PrimitiveItem | null {
	try {
		const content = readFileSync(skillPath, "utf-8");
		const { data } = matter(content);

		const parsed = SkillFrontmatterSchema.safeParse(data);
		if (!parsed.success) {
			logger.warn(
				{ skillPath, issues: parsed.error.issues },
				"Invalid skill frontmatter, using defaults",
			);
		}

		const frontmatter = parsed.success ? parsed.data : {};
		const skillDir = dirname(skillPath);
		const name = frontmatter.name || basename(skillDir);
		const description =
			frontmatter.description || "No description provided";

		return { type: "skill", name, description, path: skillPath, source };
	} catch (error) {
		logger.error({ skillPath, err: error }, "Failed to parse skill");
		return null;
	}
}

export class SkillPrimitive implements Primitive {
	readonly type = "skill";
	readonly label = "Skills";

	discoverItems(): PrimitiveItem[] {
		const items: PrimitiveItem[] = [];

		for (const path of discoverSkillPaths(GLOBAL_SKILLS_DIR)) {
			const item = parseSkill(path, "global");
			if (item) items.push(item);
		}

		// Skip local scan if it resolves to the same directory as global
		if (resolve(LOCAL_SKILLS_DIR) !== resolve(GLOBAL_SKILLS_DIR)) {
			for (const path of discoverSkillPaths(LOCAL_SKILLS_DIR)) {
				const item = parseSkill(path, "local");
				if (item) items.push(item);
			}
		}

		return items;
	}

	loadContent(item: PrimitiveItem): PrimitiveContent {
		const rawContent = readFileSync(item.path, "utf-8");

		const { content: mainContent } = matter(rawContent);

		const referencesDir = join(dirname(item.path), "references");
		const references: string[] = existsSync(referencesDir)
			? readdirSync(referencesDir)
			: [];

		return {
			item,
			mainContent,
			metadata: { references },
		};
	}

	formatForPrompt(contents: PrimitiveContent[]): string {
		const divider = "=".repeat(72);
		const thinDivider = "-".repeat(72);

		const header = `${divider}
AGENT PRIMER: ACTIVE SKILLS FOR THIS SESSION
${divider}

The following skills were hand-picked for this session. They contain
specialized knowledge, patterns, and best practices that are directly
relevant to the work ahead. Treat these as authoritative guidance and
follow them when applicable to the user's request.

${thinDivider}`;

		const skillSections = contents
			.map((s) => {
				const skillDir = dirname(s.item.path);
				const meta = SkillMetadataSchema.parse(
					s.metadata,
				) as SkillMetadata;

				let text = `
## ${s.item.name}
> Source: ${skillDir}

${s.mainContent}`;

				if (meta.references.length > 0) {
					text += `

### References bundled with ${s.item.name}:
${meta.references.map((r) => `- ${r}`).join("\n")}

Use Skill(${s.item.name}) to load any reference file.`;
				}

				return text;
			})
			.join(`\n\n${thinDivider}`);

		const footer = `\n\n${divider}
END AGENT PRIMER
${divider}`;

		return header + skillSections + footer;
	}
}
