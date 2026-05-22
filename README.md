# WoWok Skills

WoWok AI Skills for Claude Code, Trae IDE, CodeBuddy, and other AI assistants — Helping AI use WoWok MCP tools correctly.

## Supported AI Clients

| Client | Skills Directory | Format |
|--------|-----------------|--------|
| **Claude Code** | `.claude/skills/` | SKILL.md (native) |
| **Trae IDE** | `.agents/skills/` | SKILL.md (native) |
| **CodeBuddy** | `.codebuddy/skills/` | SKILL.md (native) |
| **Cursor IDE** | `.cursor/rules/` | `.mdc` (frontmatter adapted) |
| **GitHub Copilot** | `.github/prompts/` | `.prompt.md` (plain markdown) |

> **Format notes**: For Cursor, the YAML frontmatter is adapted to `description` + `alwaysApply`. For Copilot, frontmatter is stripped — pure Markdown instructions. All other clients use the native SKILL.md format directly.

## Overview

WoWok Skills provide structured guidance for AI assistants to effectively use WoWok's blockchain collaboration tools. Built on Claude Code's [progressive disclosure](https://docs.anthropic.com/en/docs/claude-code/skills) skills system, they solve common AI challenges:

- **Complex system building** — Dependency chains, build order, step-by-step patterns
- **Tool usage failures** — Correct parameter formats, tool selection, error recovery
- **Safety & authorization** — User confirmation for important operations

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter. AI clients discover them from their skills directory at session start:

```
npm install -g @wowok/skills
       │
       └── postinstall ──→ Copies SKILL.md to ~/.claude/skills/wowok-*/
                            AI discovers them on next session ✅

# For other clients, set the WOWOK_SKILLS_TARGETS env var:
WOWOK_SKILLS_TARGETS=claude,agents npm install -g @wowok/skills
       │
       └── postinstall ──→ Copies to ~/.claude/skills/ AND ~/.agents/skills/
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
# Claude Code (default):
npm install -g @wowok/skills

# Multiple clients (e.g., Claude + Trae):
WOWOK_SKILLS_TARGETS=claude,agents npm install -g @wowok/skills

# All supported clients:
WOWOK_SKILLS_TARGETS=claude,agents,codebuddy npm install -g @wowok/skills
```

This copies skills to the respective `~/.*/skills/` directories. They will be available in your next session.

### 3. Install (Project — Team Sharing)

```bash
npm install -g @wowok/skills
cd your-project

# Claude Code (default):
wowok-skills init

# Trae IDE:
wowok-skills init --target agents

# All clients:
wowok-skills init --target all
```

This copies skills to the project's `.*/skills/` directories. Commit to git for team sharing.

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
| `wowok-skills role <role>` | — | List skills by role |
| `wowok-skills recommend <intent>` | — | Recommend skills by intent |
| `wowok-skills init` | Project | Install to `.claude/skills/` (default) |
| `wowok-skills init --target agents` | Project | Install to `.agents/skills/` (Trae) |
| `wowok-skills init --target cursor` | Project | Install to `.cursor/rules/` (Cursor) |
| `wowok-skills init --target copilot` | Project | Install to `.github/prompts/` (Copilot) |
| `wowok-skills init --target all` | Project | Install to all 5 clients |
| `wowok-skills uninit` | Project | Remove from `.claude/skills/` (default) |
| `wowok-skills uninit --target all` | Project | Remove from all clients |

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
