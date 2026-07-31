# WoWok Skills

WoWok AI Skills for Claude Code, OpenAI Codex, ChatGPT Desktop (Codex Mode), Trae IDE, CodeBuddy, Cursor, Windsurf, Qoder, Roo Code, and GitHub Copilot — Helping AI use WoWok MCP tools correctly.

## Supported AI Clients

| Client | Skills Directory | Format | MCP Support |
|--------|-----------------|--------|-------------|
| **Claude Code** | `.claude/skills/` | SKILL.md (native) | ✅ `~/.claude/settings.json` |
| **OpenAI Codex CLI** | `.codex/skills/` | SKILL.md (native) | ✅ `~/.codex/config.toml` |
| **ChatGPT Desktop (Codex Mode)** | `.codex/skills/` | SKILL.md (native) | ✅ Shares Codex CLI config (`~/.codex/config.toml`) |
| **Trae IDE** | `.agents/skills/` | SKILL.md (native) | ⚙️ IDE-managed via `~/.trae-cn/mcps/` |
| **CodeBuddy** | `.codebuddy/skills/` | SKILL.md (native) | ✅ `~/.codebuddy/mcp.json` |
| **Cursor IDE** | `.cursor/rules/` | `.mdc` (frontmatter adapted) | ✅ Project-level `.cursor/mcp.json` |
| **Windsurf** | `.windsurf/skills/` | SKILL.md (native) | ✅ `~/.codeium/windsurf/mcp_config.json` |
| **Qoder** | `.qoder/skills/` | SKILL.md (native) | ✅ `~/.qoder/mcp-settings.json` (project: `.qoder/mcp.json`) |
| **Roo Code** | `.roo/skills/` | SKILL.md (native) | ✅ `~/.roo/mcp_settings.json` (project: `.roo/mcp.json`) |
| **GitHub Copilot** | `.github/prompts/` | `.prompt.md` (plain markdown) | ✅ `~/.copilot/mcp-config.json` |

> **Format notes**: For Cursor, the YAML frontmatter is adapted to `description` + `alwaysApply`. For Copilot, frontmatter is stripped — pure Markdown instructions. Codex follows the [Agent Skills](https://agentskills.io) open standard natively. All other clients use the native SKILL.md format directly.
>
> **ChatGPT Desktop (Chat Mode)** does **not** support local skills or stdio MCP. Only the **Codex Mode** (built into ChatGPT Desktop) inherits Codex CLI's skills and MCP configuration. Full MCP (write operations) in ChatGPT Desktop requires **Business, Enterprise, or Edu** plans (beta).


## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter. AI clients discover them from their skills directory at session start:

```
npm install -g @wowok/skills
       │
       ├── postinstall ──→ Copies SKILL.md to ~/.claude/skills/wowok-*/
       └── auto MCP   ──→ Installs/upgrades @wowok/agent-mcp
                           Registers MCP in client config
                           Restarts MCP server process
                           AI discovers on next session ✅

# For other clients, set the WOWOK_SKILLS_TARGETS env var:
WOWOK_SKILLS_TARGETS=claude,agents npm install -g @wowok/skills
       │
       ├── postinstall ──→ Copies to ~/.claude/skills/ AND ~/.agents/skills/
       └── auto MCP   ──→ Same MCP install/register/restart for each client
```

**Two loading modes:**

| Mode | Skills | Behavior |
|------|--------|----------|
| **Always** | `wowok-output` | Metadata always in prompt (~100 tokens). AI auto-loads full content when needed. |
| **On-demand** | `wowok-provider`, `wowok-arbitrator`, `wowok-order`, `wowok-messenger`, `wowok-machine`, `wowok-onboard`, `wowok-planner`, `wowok-auditor` | AI matches description to task. Only loaded when relevant. |

> **v2.0 migration**: The 4 rule-reference skills (`wowok-tools`, `wowok-safety`, `wowok-scenario`, `wowok-guard`) were sunk into the MCP knowledge layer (GLM5-31) and are no longer installed. Their content is served by the MCP server itself — `schema_query` actions `get_tool_reference` / `get_safety_rules` / `get_guard_design_patterns`, and `project_operation` actions `recommend_industry` / `list_modes`. Old copies in your skills directory are detected and warned about during install.

## Quick Start

### 1. Prerequisites

The `@wowok/skills` package will **automatically install and configure** the `@wowok/agent-mcp` MCP server for you. No manual setup needed.

To configure MCP manually for a specific client, see the [MCP Support](#supported-ai-clients) table above. The standard WoWok MCP server entry is:

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
WOWOK_SKILLS_TARGETS=claude,codex,agents,codebuddy,cursor,windsurf,qoder,roo,copilot npm install -g @wowok/skills
```

This copies skills to the respective `~/.*/skills/` directories. They will be available in your next session.

### 3. Install (Project — Team Sharing)

```bash
npm install -g @wowok/skills
cd your-project

# Claude Code (default):
wowok-skills init

# OpenAI Codex / ChatGPT Desktop (Codex Mode):
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
rm -rf ~/.claude/skills/wowok-machine

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
| `wowok-skills init --target codex` | Project | Install to `.codex/skills/` (Codex / ChatGPT Desktop) |
| `wowok-skills init --target agents` | Project | Install to `.agents/skills/` (Trae) |
| `wowok-skills init --target cursor` | Project | Install to `.cursor/rules/` (Cursor) |
| `wowok-skills init --target copilot` | Project | Install to `.github/prompts/` (Copilot) |
| `wowok-skills init --target windsurf` | Project | Install to `.windsurf/skills/` (Windsurf) |
| `wowok-skills init --target qoder` | Project | Install to `.qoder/skills/` (Qoder) |
| `wowok-skills init --target roo` | Project | Install to `.roo/skills/` (Roo Code) |
| `wowok-skills init --target all` | Project | Install to all 10 clients |
| `wowok-skills uninit` | Project | Remove from `.claude/skills/` (default) |
| `wowok-skills uninit --target all` | Project | Remove from all clients |

> **Note**: `init` / `uninit` require `@wowok/skills` to be globally installed first.
>
> **MCP auto-install**: `npm install -g @wowok/skills` (postinstall) and `wowok-skills init` automatically install/upgrade the `@wowok/agent-mcp` MCP server and register it in each client's config. Set `WOWOK_SKILLS_NO_MCP=1` to skip MCP management.

## Programmatic API

```typescript
import { getSkills, getSkillByName } from '@wowok/skills';

const skills = getSkills();
const providerSkill = getSkillByName('wowok-provider');
```

## Available Skills

### Always Loaded (1 skill — foundational layer)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-output` | Output processing — address resolution, name mapping, amount formatting, data visualization | All Roles |

### On-Demand (8 skills — contextually loaded)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-provider` | Service provider guide — create Service, Machine, Allocators, handle order fulfillment, fork project iteration | Service Provider (Merchant) |
| `wowok-arbitrator` | Arbitration service — create Arbitration, handle disputes, organize voting, manage fees | Arbitrator |
| `wowok-order` | Customer order lifecycle — pre-purchase due diligence (E1-E10), consensus building, order creation, progress advancement, arbitration | Customer |
| `wowok-messenger` | Encrypted messaging — E2E communication, WTS evidence, anti-spam strategy, Contact object lifecycle | All Roles |
| `wowok-machine` | Machine workflow design — state machines, node/pair/forward graph, immutability rules, dependency-first build order | Service Provider |
| `wowok-onboard` | First-touch onboarding — 10-round dialogue from zero to first published Service, SQLite-based project pipeline integration | New Users |
| `wowok-planner` | Planning skill — converts natural language intent into Object Dependency Graph (ODG), industry-mode aware via MCP | All Roles |
| `wowok-auditor` | Pre-publish audit — Guard completeness, Machine soundness, fund flow correctness, publish readiness | All Roles |

### Sunk to MCP Knowledge Layer (v2.0 — no longer skills)

| Former Skill | Now Served By |
|--------------|---------------|
| `wowok-tools` | MCP `schema_query` action='get_tool_reference' |
| `wowok-safety` | MCP `schema_query` action='get_safety_rules' + runtime confirm-gate on every write |
| `wowok-scenario` | MCP `project_operation` actions 'recommend_industry' / 'list_modes' / 'create_project' |
| `wowok-guard` | MCP `schema_query` actions 'get_guard_design_patterns' / 'get_guard_templates' |

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
