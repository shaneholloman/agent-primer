# agent-primer

Prime your agent sessions with preloaded skills and domain knowledge.

Agent Primer cuts through the noise of available skills by letting you
assert what matters for each session. Selected primitives are injected
into the system prompt so the agent has the right context from the first
message.

## Installation

```bash
# With bun (recommended)
bun install -g agent-primer

# With npm
npm install -g agent-primer
```

> Requires [Bun](https://bun.sh) runtime and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

## Quick Start

```bash
# Launch the interactive wizard
ap

# List all available primitives
ap --list

# Dangerous mode (skips permission prompts)
apx
```

## Usage

```bash
ap                    # Standard mode
apx                   # Dangerous mode (skips permission prompts)
agent-primer          # Full command name
```

### What happens when you run `ap`

1. Scans global and local directories for skills and domains
2. Shows per-type pickers (skills first, then domains)
3. Recently used items are marked and sorted to the top
4. Asks for confirmation before launching
5. Launches Claude with selected primitives injected via `--append-system-prompt`

## Primitives

Agent Primer uses the concept of "primitives" -- units of knowledge that
can be preloaded into an agent session. Each primitive type serves a
different purpose.

### Skills

Behavioral patterns and best practices. Skills tell the agent *how* to
work: coding standards, review processes, tool-specific patterns.

```tree
~/.claude/skills/
└── my-skill/
    ├── SKILL.md           # Required: main skill file
    └── references/        # Optional: additional context
        ├── patterns.md
        └── examples.md
```

SKILL.md uses YAML frontmatter:

````markdown
---
name: my-skill
description: Brief description shown in the selector
---

# My Skill

Instructions, patterns, and best practices for the agent to follow.
````

### Domains

Reference knowledge about a subject area. Domains tell the agent *what*
it is working with: business context, specifications, terminology,
architecture docs.

```tree
~/.claude/domains/
└── my-domain/
    ├── DOMAIN.md          # Required: main domain file
    └── references/        # Optional: deeper reference material
        ├── glossary.md
        └── api-spec.md
```

DOMAIN.md uses YAML frontmatter:

````markdown
---
name: my-domain
description: Brief description shown in the selector
---

# My Domain

Core concepts, terminology, and reference material.
````

## Primitive Locations

| Location             | Scope  | Primitive Types                   |
| -------------------- | ------ | --------------------------------- |
| `~/.claude/skills/`  | Global | Skills available in all projects  |
| `./.claude/skills/`  | Local  | Project-specific skills           |
| `~/.claude/domains/` | Global | Domains available in all projects |
| `./.claude/domains/` | Local  | Project-specific domains          |

Items are labeled `[global]` or `[local]` in the picker.

## Commands

| Command        | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `ap`           | Standard mode - prompts for permissions                       |
| `apx`          | Dangerous mode - auto-passes `--dangerously-skip-permissions` |
| `agent-primer` | Full command (same as `ap`)                                   |

## Options

```sh
-h, --help        Show help message
-l, --list        List available primitives and exit
--clear-recent    Clear the recent selections cache
```

## Passing Options to Claude

Use `--` to separate agent-primer options from Claude options:

```bash
ap -- --model opus           # Use Opus model
ap -- --model sonnet         # Use Sonnet model
ap -- -p "prompt"            # Non-interactive prompt mode
ap -- -c                     # Continue previous conversation
```

## Examples

```bash
# Interactive wizard
ap

# List everything available
ap --list

# Dangerous mode with Opus
apx -- --model opus

# Non-interactive with preloaded primitives
ap -- -p "refactor this function"

# Clear the recent selections cache
ap --clear-recent
```

## How It Works

1. Scans both global and local directories for each primitive type
2. Presents a separate multi-select picker per type with badge headers
3. Shows a confirmation step (Yes / No, start over / Exit)
4. Loads full content from selected SKILL.md and DOMAIN.md files
5. Formats each primitive type with distinct framing so the agent
   understands the difference between skills (behavioral) and domains
   (reference)
6. Concatenates and passes everything to Claude via `--append-system-prompt`

## Cache

Recent selections are cached at `~/.cache/agent-primer/recent.json` to
surface frequently used items first in the picker.

```bash
# Clear the cache
ap --clear-recent
```

## License

MIT
