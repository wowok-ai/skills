# WoWok Skills

WoWok AI Skills for Claude Code, OpenAI Codex, Trae IDE, CodeBuddy, Cursor, and GitHub Copilot — Helping AI use WoWok MCP tools correctly.

## Supported AI Clients

| Client | Skills Directory | Format |
|--------|-----------------|--------|
| **Claude Code** | `.claude/skills/` | SKILL.md (native) |
| **OpenAI Codex** | `.codex/skills/` | SKILL.md (native) |
| **Trae IDE** | `.agents/skills/` | SKILL.md (native) |
| **CodeBuddy** | `.codebuddy/skills/` | SKILL.md (native) |
| **Cursor IDE** | `.cursor/rules/` | `.mdc` (frontmatter adapted) |
| **GitHub Copilot** | `.github/prompts/` | `.prompt.md` (plain markdown) |

> **Format notes**: For Cursor, the YAML frontmatter is adapted to `description` + `alwaysApply`. For Copilot, frontmatter is stripped — pure Markdown instructions. Codex follows the [Agent Skills](https://agentskills.io) open standard natively. All other clients use the native SKILL.md format directly.


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
| **Always** | `wowok-tools`, `wowok-safety`, `wowok-output` | Metadata always in prompt (~100 tokens each). AI auto-loads full content when needed. |
| **On-demand** | `wowok-provider`, `wowok-arbitrator`, `wowok-order`, `wowok-messenger`, `wowok-guard`, `wowok-machine`, `wowok-onboard`, `wowok-scenario`, `wowok-planner`, `wowok-auditor`, `wowok-distill` | AI matches description to task. Only loaded when relevant. |

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
WOWOK_SKILLS_TARGETS=claude,codex,agents,codebuddy,cursor,copilot npm install -g @wowok/skills
```

This copies skills to the respective `~/.*/skills/` directories. They will be available in your next session.

### 3. Install (Project — Team Sharing)

```bash
npm install -g @wowok/skills
cd your-project

# Claude Code (default):
wowok-skills init

# OpenAI Codex:
wowok-skills init --target codex

# Trae IDE:
wowok-skills init --target agents

# Cursor IDE:
wowok-skills init --target cursor

# GitHub Copilot:
wowok-skills init --target copilot

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
| `wowok-skills init --target codex` | Project | Install to `.codex/skills/` (Codex) |
| `wowok-skills init --target agents` | Project | Install to `.agents/skills/` (Trae) |
| `wowok-skills init --target cursor` | Project | Install to `.cursor/rules/` (Cursor) |
| `wowok-skills init --target copilot` | Project | Install to `.github/prompts/` (Copilot) |
| `wowok-skills init --target all` | Project | Install to all 6 clients |
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

### Always Loaded (3 skills — foundational layer)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-tools` | MCP tool reference — 17 sub-tools, schema-gated execution, schema-inexpressible constraints, supporting objects decision guide | All Roles |
| `wowok-safety` | Safety protocol — dry-run → confirm → execute, immutability rules, confirmation checkpoints | All Roles |
| `wowok-output` | Output processing — address resolution, name mapping, amount formatting, data visualization | All Roles |

### On-Demand (11 skills — contextually loaded)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-provider` | Service provider guide — create Service, Machine, Allocators, handle order fulfillment, fork project iteration | Service Provider (Merchant) |
| `wowok-arbitrator` | Arbitration service — create Arbitration, handle disputes, organize voting, manage fees | Arbitrator |
| `wowok-order` | Customer order lifecycle — pre-purchase due diligence (E1-E10), consensus building, order creation, progress advancement, arbitration | Customer |
| `wowok-messenger` | Encrypted messaging — E2E communication, WTS evidence, anti-spam strategy, Contact object lifecycle | All Roles |
| `wowok-guard` | Guard design mastery — programmable trust rules, 4 data source classifications, verifier constraint levels, 33 creation/runtime constraints | All Roles |
| `wowok-machine` | Machine workflow design — state machines, node/pair/forward graph, immutability rules, dependency-first build order | Service Provider |
| `wowok-onboard` | First-touch onboarding — 10-round dialogue from zero to first published Service, MCP 5-stage pipeline integration | New Users |
| `wowok-scenario` | Industry mode templates — freelance, rental, education, travel, subscription presets with audit checklists and failure playbooks | All Roles |
| `wowok-planner` | Planning skill — converts natural language intent into Object Dependency Graph (ODG), 5 scenario templates | All Roles |
| `wowok-auditor` | Pre-publish audit — Guard completeness, Machine soundness, fund flow correctness, 32 audit checks | All Roles |
| `wowok-distill` | Distillation review — guides merchants through reviewing AI-generated improvement proposals from the Loop Engineering flywheel | Service Provider |

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
