# WoWok Skills

WoWok AI Skills for Claude Code — Helping AI assistants use WoWok MCP tools correctly.

## Overview

WoWok Skills provide structured guidance for AI assistants to effectively use WoWok's blockchain collaboration tools. Built on Claude Code's [progressive disclosure](https://docs.anthropic.com/en/docs/claude-code/skills) skills system, they solve common AI challenges:

- **Complex system building** — Dependency chains, build order, step-by-step patterns
- **Tool usage failures** — Correct parameter formats, tool selection, error recovery
- **Safety & authorization** — User confirmation for important operations

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter. Claude Code discovers them from `~/.claude/skills/` at session start:

```
npm install -g @wowok/skills
       │
       └── postinstall ──→ Copies 7 SKILL.md to ~/.claude/skills/wowok-*/
                            AI discovers them on next session ✅
```

**Two loading modes:**

| Mode | Skills | Behavior |
|------|--------|----------|
| **Always** | `wowok-tools`, `wowok-safety` | Metadata always in prompt (~100 tokens each). AI auto-loads full content when needed. |
| **On-demand** | `wowok-provider`, `wowok-arbitrator`, `wowok-order`, `wowok-messenger`, `wowok-guard`, `wowok-machine` | AI matches description to task. Only loaded when relevant. |

## Quick Start

### 1. Prerequisites

Setup WoWok Agent (MCP Server) in your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "wowok": {
      "command": "npx",
      "args": ["-y", "@wowok/agent-mcp"]
    }
  }
}
```

See [WoWok Agent](https://github.com/wowok-ai/agent) for more details.

### 2. Install (Personal)

```bash
npm install -g @wowok/skills
```

This automatically installs all 8 skills to `~/.claude/skills/`. They will be available in your next Claude Code session.

### 3. Install (Project — Team Sharing)

```bash
npm install -g @wowok/skills
cd your-project
wowok-skills init
```

This copies skills to `.claude/skills/` in your project. Commit to git for team sharing.

## Managing Skills

### Enable / Disable Individual Skills

```bash
# Disable a specific skill:
rm -rf ~/.claude/skills/wowok-guard

# Re-enable it:
npm install -g @wowok/skills
```

### Check What's Installed

```bash
wowok-skills list
wowok-skills get wowok-provider
```

### Update

```bash
npm update -g @wowok/skills
```

### Uninstall

```bash
# Remove from personal scope:
npm uninstall -g @wowok/skills

# Remove from project scope:
cd your-project
wowok-skills uninit
```

## CLI Reference

| Command | Scope | Description |
|---------|-------|-------------|
| `wowok-skills list` | — | List all available skills |
| `wowok-skills get <name>` | — | Show skill details |
| `wowok-skills init` | Project | Install skills to `.claude/skills/` |
| `wowok-skills uninit` | Project | Remove skills from `.claude/skills/` |

> **Note**: `init` / `uninit` require `@wowok/skills` to be globally installed first.

## Programmatic API

```typescript
import { getSkills, getSkillByName } from '@wowok/skills';

const skills = getSkills();
const providerSkill = getSkillByName('wowok-provider');
```

## Available Skills

| Skill | Purpose | Role | Loading |
|-------|---------|------|---------|
| `wowok-provider` | Service provider guide (create Service, Machine, Allocators, handle orders) | Service Provider (Merchant) | On-demand |
| `wowok-arbitrator` | Arbitration service guide (create Arbitration, handle disputes, voting) | Arbitrator | On-demand |
| `wowok-order` | Order lifecycle management (place orders, track progress, arbitration) | Customer | On-demand |
| `wowok-messenger` | Encrypted messaging (E2E communication, WTS evidence, conversation management) | All Roles | On-demand |
| `wowok-guard` | Guard design mastery (programmable trust rules) | All Roles | On-demand |
| `wowok-machine` | Machine workflow design (state machines, progress tracking) | Service Provider | On-demand |
| `wowok-tools` | MCP tool usage mastery (13 tools, schema references) | All Roles | Always |
| `wowok-safety` | Safety protocol (dry-run → confirm → execute) | All Roles | Always |

## Related Projects

- **WoWok Agent (MCP Server)**: [https://github.com/wowok-ai/agent](https://github.com/wowok-ai/agent) — npm: `@wowok/agent-mcp`
- **WoWok Documentation**: [https://github.com/wowok-ai/docs](https://github.com/wowok-ai/docs)

## Development

```bash
npm install
npm run build
npm run watch
```

## License

MIT
