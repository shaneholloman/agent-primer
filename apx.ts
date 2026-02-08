#!/usr/bin/env bun

// Dangerous mode entry point - skips Claude permission prompts
process.env.AGENT_PRIMER_DANGEROUS = "1";

await import("./index.ts");
