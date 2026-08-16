# WoWok Skills

WoWok AI Skills for Claude Code, OpenAI Codex, ChatGPT Desktop (Codex Mode), Trae IDE, CodeBuddy, Cursor, Windsurf, Qoder, Roo Code, and GitHub Copilot — Helping AI use WoWok MCP tools correctly.

## Supported AI Clients

| Client | Skills Directory | Format | MCP Support |
|--------|-----------------|--------|-------------|
| **Claude Code** | `.claude/skills/` | SKILL.md (native) | ✅ `~/.claude/settings.json` |
| **OpenAI Codex CLI** | `.codex/skills/` | SKILL.md (native) | ✅ `~/.codex/config.toml` |
| **ChatGPT Desktop (Codex Mode)** | `.codex/skills/` | SKILL.md (native) | ✅ Shares Codex CLI config |
| **Trae IDE** | `.agents/skills/` | SKILL.md (native) | ⚙️ IDE-managed via `~/.trae-cn/mcps/` |
| **CodeBuddy** | `.codebuddy/skills/` | SKILL.md (native) | ✅ `~/.codebuddy/mcp.json` |
| **Cursor IDE** | `.cursor/rules/` | `.mdc` (frontmatter adapted) | ✅ Project-level `.cursor/mcp.json` |
| **Windsurf** | `.windsurf/skills/` | SKILL.md (native) | ✅ `~/.codeium/windsurf/mcp_config.json` |
| **Qoder** | `.qoder/skills/` | SKILL.md (native) | ✅ Global + project config |
| **Roo Code** | `.roo/skills/` | SKILL.md (native) | ✅ Global + project config |
| **GitHub Copilot** | `.github/prompts/` | `.prompt.md` (plain markdown) | ✅ `~/.copilot/mcp-config.json` |

> **Format notes**: For Cursor, the YAML frontmatter is adapted to `description` + `alwaysApply`. For Copilot, frontmatter is stripped — pure Markdown instructions.
>
> **ChatGPT Desktop (Chat Mode)** does **not** support local skills or stdio MCP. Only the **Codex Mode** (built into ChatGPT Desktop) inherits Codex CLI's skills and MCP configuration.

## How It Works

Each skill is a `SKILL.md` file with YAML frontmatter. The installer copies them to **every** client's skills directory automatically. MCP server is installed and registered — no manual steps.

```
npm install -g @wowok/skills
       │
       ├── postinstall ──→ Copies SKILL.md to ALL client skill dirs
       │                     (~/.claude/skills/, ~/.cursor/rules/, ~/.agents/skills/, …)
       └── auto MCP   ──→ Installs/upgrades @wowok/agent-mcp
                           Registers MCP in each client config
                           Restarts MCP server process
                           AI discovers on next session ✅
```

**Two loading modes:**

| Mode | Skills | Behavior |
|------|--------|----------|
| **Always** | `wowok-output` | Metadata always in prompt (~100 tokens). AI auto-loads full content when needed. |
| **On-demand** | All others | AI matches description to task. Only loaded when relevant. |

> **v2.0 migration**: The 4 rule-reference skills (`wowok-tools`, `wowok-safety`, `wowok-scenario`, `wowok-guard`) were sunk into the MCP knowledge layer and are no longer installed. Their content is served by the MCP server itself — `schema_query` actions `get_tool_reference` / `get_safety_rules` / `get_guard_design_patterns`, and `project_operation` actions.

## Quick Start

### Step 1 — Install Globally (Personal Use)

One command. Skills install to **all 9 supported AI clients** at once. MCP server auto-installs and registers.

```bash
npm install -g @wowok/skills
```

That's it. Next session in any AI client, WoWok on-chain actions work out of the box.

> Rarely needed: to install only a subset of clients, set `WOWOK_SKILLS_TARGETS=claude,trae npm install -g @wowok/skills`.
> Set `WOWOK_SKILLS_NO_MCP=1` to skip MCP auto-management.

### Step 2 — Install into Your Project (Team Sharing, Optional)

Add skills to the repo itself. Commit to git — the whole team gets the same pack automatically.

```bash
npm install -g @wowok/skills   # skip if already done
cd your-project

# All clients (default, recommended):
wowok-skills init

# Single client only (pick one):
wowok-skills init --target claude
wowok-skills init --target cursor
wowok-skills init --target trae
wowok-skills init --target codex
wowok-skills init --target windsurf
wowok-skills init --target codebuddy
wowok-skills init --target qoder
wowok-skills init --target roo
wowok-skills init --target copilot
```

## Managing Skills

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
wowok-skills uninit                # all clients (default)
wowok-skills uninit --target claude
```

### Check What's Installed

```bash
wowok-skills list
wowok-skills get wowok-provider
wowok-skills role provider
wowok-skills recommend "create a service"
```

### Save the Airdrop Referrer

The referrer is auto-recorded on your first on-chain interaction. Save it once:

```bash
# Global (personal) referrer — persists across all projects:
wowok-skills referrer <address-or-name>

# Or just once during project init:
wowok-skills init --referrer <address-or-name>
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `wowok-skills list` | List all available skills |
| `wowok-skills get <name>` | Show skill details |
| `wowok-skills role <role>` | List skills by role (customer \| provider \| arbitrator \| shared) |
| `wowok-skills recommend <intent>` | Recommend skills by user intent |
| `wowok-skills init` | Install to project — all clients (default) |
| `wowok-skills init --target <t>` | Install to project — one client only |
| `wowok-skills init --no-mcp` | Install skills only, skip MCP setup |
| `wowok-skills init --referrer <addr\|name>` | Init + save airdrop referrer |
| `wowok-skills referrer <addr\|name>` | Save airdrop referrer globally (no project needed) |
| `wowok-skills uninit` | Remove from project — all clients (default) |
| `wowok-skills uninit --target <t>` | Remove from project — one client |

> `--target <t>` choices: `claude`, `cursor`, `windsurf`, `codebuddy`, `codex`, `trae`, `qoder`, `roo`, `copilot`. Default: all.

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
| `wowok-order` | Customer order lifecycle — pre-purchase due diligence, consensus building, order creation, progress advancement, arbitration | Customer |
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
| `wowok-scenario` | MCP `project_operation` actions 'recommend_industry' / 'create_project' |
| `wowok-guard` | MCP `schema_query` actions 'get_guard_design_patterns' / 'get_guard_templates' |

## Related Projects

- **WoWok Documentation**: [https://github.com/wowok-ai/docs](https://github.com/wowok-ai/docs)

## Development

```bash
npm install
npm run build
npm run watch
```

## License

MIT
