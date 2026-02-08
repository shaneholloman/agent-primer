import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PrimitiveItem, RecentCache } from "./types.ts";
import { RecentCacheSchema } from "./types.ts";

const CACHE_DIR = join(homedir(), ".cache", "agent-primer");
const CACHE_FILE = join(CACHE_DIR, "recent.json");
const MAX_RECENT = 10;

export function cacheKey(item: PrimitiveItem): string {
	return `${item.type}:${item.source}:${item.name}`;
}

export function loadCache(): RecentCache {
	try {
		if (existsSync(CACHE_FILE)) {
			const data = readFileSync(CACHE_FILE, "utf-8");
			const parsed = RecentCacheSchema.safeParse(JSON.parse(data));
			if (parsed.success) return parsed.data;
		}
	} catch {
		// Corrupt or unreadable file -- fall through to empty cache
	}
	return { recent: {} };
}

export function saveCache(cache: RecentCache): void {
	try {
		mkdirSync(CACHE_DIR, { recursive: true });
		writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
	} catch {
		// Ignore errors
	}
}

export function updateCache(items: PrimitiveItem[]): void {
	const cache = loadCache();
	const now = Date.now();

	for (const item of items) {
		cache.recent[cacheKey(item)] = now;
	}

	// Prune to keep only MAX_RECENT most recent
	const entries = Object.entries(cache.recent);
	if (entries.length > MAX_RECENT) {
		entries.sort((a, b) => b[1] - a[1]);
		cache.recent = Object.fromEntries(entries.slice(0, MAX_RECENT));
	}

	saveCache(cache);
}

export function sortByRecent(
	items: PrimitiveItem[],
	cache: RecentCache,
): PrimitiveItem[] {
	return [...items].sort((a, b) => {
		const aTime = cache.recent[cacheKey(a)] || 0;
		const bTime = cache.recent[cacheKey(b)] || 0;
		if (aTime !== bTime) return bTime - aTime;
		return a.name.localeCompare(b.name);
	});
}

export function clearCache(): boolean {
	if (existsSync(CACHE_FILE)) {
		unlinkSync(CACHE_FILE);
		return true;
	}
	return false;
}
