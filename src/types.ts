// Intelligence Control Primitives (ICPs) -- generic abstractions for anything
// that can be preloaded into an agent session. "Primitive" is the shorthand
// used throughout the codebase.

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Schemas (source of truth -- TypeScript types are inferred from these)
// ---------------------------------------------------------------------------

export const PrimitiveItemSchema = z.object({
	type: z.string(), // "skill", "context", etc.
	name: z.string(),
	description: z.string(),
	path: z.string(),
	source: z.enum(["global", "local"]),
});

export const PrimitiveContentSchema = z.object({
	item: PrimitiveItemSchema,
	mainContent: z.string(),
	metadata: z.record(z.string(), z.unknown()),
});

export const ParsedArgsSchema = z.object({
	help: z.boolean(),
	clearRecent: z.boolean(),
	list: z.boolean(),
	dangerousMode: z.boolean(),
	claudeArgs: z.array(z.string()),
});

export const RecentCacheSchema = z.object({
	recent: z.record(z.string(), z.number()),
});

// Skill-specific: validates YAML frontmatter from SKILL.md files
export const SkillFrontmatterSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
});

// Skill-specific: typed metadata carried in PrimitiveContent.metadata
export const SkillMetadataSchema = z.object({
	references: z.array(z.string()),
});

// Domain-specific: validates YAML frontmatter from DOMAIN.md files
export const DomainFrontmatterSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
});

// Domain-specific: typed metadata carried in PrimitiveContent.metadata
export const DomainMetadataSchema = z.object({
	references: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PrimitiveItem = z.infer<typeof PrimitiveItemSchema>;
export type PrimitiveContent = z.infer<typeof PrimitiveContentSchema>;
export type ParsedArgs = z.infer<typeof ParsedArgsSchema>;
export type RecentCache = z.infer<typeof RecentCacheSchema>;
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
export type DomainFrontmatter = z.infer<typeof DomainFrontmatterSchema>;
export type DomainMetadata = z.infer<typeof DomainMetadataSchema>;

// ---------------------------------------------------------------------------
// Primitive interface (not a Zod schema -- this is a behavioral contract)
// ---------------------------------------------------------------------------

export interface Primitive {
	readonly type: string;
	readonly label: string; // Display name: "Skills", "Contexts"

	discoverItems(): PrimitiveItem[];
	loadContent(item: PrimitiveItem): PrimitiveContent;
	formatForPrompt(contents: PrimitiveContent[]): string;
}
