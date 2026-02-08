import {
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import matter from "gray-matter";
import pino from "pino";
import type {
	DomainMetadata,
	Primitive,
	PrimitiveContent,
	PrimitiveItem,
} from "../types.ts";
import { DomainFrontmatterSchema, DomainMetadataSchema } from "../types.ts";

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

const GLOBAL_DOMAINS_DIR = join(homedir(), ".claude", "domains");
const LOCAL_DOMAINS_DIR = join(process.cwd(), ".claude", "domains");

function discoverDomainPaths(dir: string): string[] {
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
			const domainFile = join(realPath, "DOMAIN.md");
			if (existsSync(domainFile)) {
				paths.push(domainFile);
			}
		} else if (entry.name === "DOMAIN.md") {
			paths.push(fullPath);
		}
	}

	return paths;
}

function parseDomain(
	domainPath: string,
	source: "global" | "local",
): PrimitiveItem | null {
	try {
		const content = readFileSync(domainPath, "utf-8");
		const { data } = matter(content);

		const parsed = DomainFrontmatterSchema.safeParse(data);
		if (!parsed.success) {
			logger.warn(
				{ domainPath, issues: parsed.error.issues },
				"Invalid domain frontmatter, using defaults",
			);
		}

		const frontmatter = parsed.success ? parsed.data : {};
		const domainDir = dirname(domainPath);
		const name = frontmatter.name || basename(domainDir);
		const description =
			frontmatter.description || "No description provided";

		return { type: "domain", name, description, path: domainPath, source };
	} catch (error) {
		logger.error({ domainPath, err: error }, "Failed to parse domain");
		return null;
	}
}

export class DomainPrimitive implements Primitive {
	readonly type = "domain";
	readonly label = "Domains";

	discoverItems(): PrimitiveItem[] {
		const items: PrimitiveItem[] = [];

		for (const path of discoverDomainPaths(GLOBAL_DOMAINS_DIR)) {
			const item = parseDomain(path, "global");
			if (item) items.push(item);
		}

		for (const path of discoverDomainPaths(LOCAL_DOMAINS_DIR)) {
			const item = parseDomain(path, "local");
			if (item) items.push(item);
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
AGENT PRIMER: DOMAIN KNOWLEDGE FOR THIS SESSION
${divider}

The following domain knowledge has been loaded for this session. This is
reference material describing the concepts, standards, and context
relevant to the work ahead. Use it to inform your decisions and avoid
redundant research.

${thinDivider}`;

		const domainSections = contents
			.map((d) => {
				const domainDir = dirname(d.item.path);
				const meta = DomainMetadataSchema.parse(
					d.metadata,
				) as DomainMetadata;

				let text = `
## ${d.item.name}
> Source: ${domainDir}

${d.mainContent}`;

				if (meta.references.length > 0) {
					text += `

### References bundled with ${d.item.name}:
${meta.references.map((r) => `- ${r}`).join("\n")}

These files are available in ${domainDir}/references/ and can be read
directly when deeper detail is needed.`;
				}

				return text;
			})
			.join(`\n\n${thinDivider}`);

		const footer = `\n\n${divider}
END DOMAIN KNOWLEDGE
${divider}`;

		return header + domainSections + footer;
	}
}
