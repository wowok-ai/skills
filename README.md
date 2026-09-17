# WoWok Skills

WoWok AI Skills for **Claude Code, OpenAI Codex CLI / ChatGPT Desktop (Codex mode), Gemini CLI, Qwen Code, Grok Build (xAI), OpenCode, Google Antigravity, Trae, Cursor, Devin Desktop (formerly Windsurf), CodeBuddy, WorkBuddy, Qoder, Cline, Kilo Code and GitHub Copilot** — a dialogue-orchestration layer on top of the WoWok MCP server.

One command installs the skills into every supported client **and** registers the MCP server:

```bash
npm install -g @wowok/skills
wowok-skills doctor        # verify what each client can actually see
```

> **v3.1.0 — installation was rebuilt around each client's official documentation.**
> Previous versions wrote to directories several clients never read (`.codex/skills`, `.windsurf/skills`, `~/.github/prompts`), registered MCP in the wrong file for Claude Code, and used a bare `npx` command that cannot start on native Windows. Everything below reflects the verified layout. If you installed an older version, run `wowok-skills init --force` once.
>
> **v3.3.0 — CodeBuddy's global MCP file moved to the dotted `~/.codebuddy/.mcp.json`** (official docs 2026-08-26 deprecate the dotless `mcp.json`; old entries are migrated automatically), Google Antigravity MCP registration is now automated (`~/.gemini/config/mcp_config.json`, unified by Antigravity 2.0), and **WorkBuddy (Tencent)** was added as a new target.

## Supported clients

Every skill is a directory containing `SKILL.md` (YAML frontmatter + Markdown), the portable [Agent Skills](https://agentskills.io/specification) format.

| Client | User-scope skills | Project-scope skills | MCP config |
|--------|-------------------|----------------------|------------|
| **Cross-client** (read by Codex, Cursor, Devin Desktop, Kilo, Antigravity, Gemini CLI alias, Trae*) | `~/.agents/skills/` | `.agents/skills/` | — |
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` | `~/.claude.json` (user) · `.mcp.json` (project) |
| **OpenAI Codex CLI / ChatGPT Codex mode** | `~/.agents/skills/` **+** `~/.codex/skills/` | `.agents/skills/` | `~/.codex/config.toml` · `.codex/config.toml` |
| **Gemini CLI** | `~/.gemini/skills/` | `.gemini/skills/` | `~/.gemini/settings.json` · `.gemini/settings.json` |
| **Qwen Code** | `~/.qwen/skills/` | `.qwen/skills/` | `~/.qwen/settings.json` · `.qwen/settings.json` |
| **Grok Build (xAI)** | `~/.grok/skills/` | `.grok/skills/` | `~/.grok/config.toml` · `.grok/config.toml` |
| **OpenCode** | `~/.config/opencode/skills/` | `.opencode/skills/` | `~/.config/opencode/opencode.json` · `opencode.json` |
| **Google Antigravity** | `~/.gemini/config/skills/` | `.agents/skills/` | `~/.gemini/config/mcp_config.json` |
| **Trae (CN & international)** | `~/.trae-cn/skills/` (CN) · `~/.trae/skills/` (intl) | `.trae/skills/` | `<user-data>/User/mcp.json` · `.trae/mcp.json` |
| **Cursor** | `~/.cursor/skills/` | `.cursor/skills/` | `~/.cursor/mcp.json` · `.cursor/mcp.json` |
| **Devin Desktop (formerly Windsurf)** | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` | `~/.codeium/windsurf/mcp_config.json` |
| **CodeBuddy** | `~/.codebuddy/skills/` | `.codebuddy/skills/` | `~/.codebuddy/.mcp.json` (user) · `.mcp.json` (project) |
| **WorkBuddy (Tencent)** | `~/.workbuddy/skills/` | `.agents/skills/` | `~/.workbuddy/mcp.json` · `.workbuddy/mcp.json` |
| **Qoder** | `~/.qoder/skills/` | `.qoder/skills/` | `~/.qoder/settings.json` · `.mcp.json` |
| **Cline** | `~/.cline/skills/` | `.cline/skills/` | `~/.cline/mcp.json` + VS Code globalStorage |
| **Kilo Code** | `~/.kilo/skills/` | `.kilo/skills/` | VS Code globalStorage · see note |
| **GitHub Copilot** | `~/.copilot/skills/` | `.github/skills/` | `~/.copilot/mcp-config.json` · `.github/mcp.json` |

Notes that are not automatic:

- **Google Antigravity 2.0** shares one MCP config across CLI / 2.0 / IDE: `~/.gemini/config/mcp_config.json` (older docs pointing at `~/.gemini/antigravity/` are outdated — 2.0 unified the path).
- **WorkBuddy** loads `~/.workbuddy/skills/` after an app restart; the in-app skill market (SkillHub) is an alternative import path. Its MCP config is standard `mcpServers` JSON (stdio + SSE), also editable via Plugins → MCP Servers → Configure MCP.
- **Grok Build** also auto-reads Claude Code's skills and MCP config (`~/.claude/skills`, project `.mcp.json`), so the `claude` target alone already makes WoWok work in Grok — the `grok` target adds Grok-native registrations.
- **Trae** reads `.agents/skills/` only after you enable *Settings → Skills & Commands → enable the `.agents` skills directory*. The installer also writes Trae's own global root, so this is optional.
- **Kilo Code (new platform)** keeps MCP in `~/.config/kilo/kilo.jsonc` under the `mcp` key. If that file exists the installer leaves it alone (rewriting would drop your comments) and prints a manual instruction; otherwise it writes `~/.config/kilo/kilo.json` for you.
- **Devin Desktop / Cline / Kilo**: for transport reasons their MCP config is only registered for the files that already exist on your machine. Install the client first, then re-run `wowok-skills init`.
- **ChatGPT Desktop (Chat mode)** supports neither local skills nor stdio MCP. Only Codex mode inherits the Codex CLI configuration.


## How it works

```
npm install -g @wowok/skills
       │
       ├── postinstall ──→ writes SKILL.md to every target (hash-based, idempotent)
       │                   prunes skills this version no longer ships
       │                   removes deprecated skills (wowok-guard/tools/safety/scenario)
       │                   removes pre-3.1 artifacts (cursor `.mdc` rules, .prompt.md files)
       │
       └── MCP server ───→ installs/upgrades @wowok/agent-mcp globally
                           registers a Windows-safe launcher in each client config
                           prefers `node <abs>/@wowok/agent-mcp/dist/index.js`
                           falls back to `cmd /c npx -y @wowok/agent-mcp` on Windows
```

Each target root gets a `.wowok-skills.json` manifest recording the version and a hash per skill, which is what makes refreshes, pruning and `doctor` possible.

**Loading modes**

| Mode | Skills | Behavior |
|------|--------|----------|
| **Always** | `wowok-output` | Metadata always in the prompt (`metadata.loading: always`). |
| **On-demand** | All others | The client matches the `description` against the task. |

> **Portability rule**: frontmatter contains exactly `name`, `description` and `metadata`. Custom attributes (version, role, loading, related) live under `metadata:` because the spec — and the strict paths used by claude.ai uploads, the Skills API and Copilot — reject unknown top-level keys. Trigger guidance belongs in `description`, since almost every client matches on that field alone.

## Quick start

### 1 — Install globally (personal use)

```bash
npm install -g @wowok/skills
```

That's it: skills go to all targets and the MCP server is registered. Next session, WoWok on-chain actions work out of the box.

```bash
wowok-skills doctor     # per-client: skills fresh/stale/missing + MCP registration
```

Rarely needed knobs:

```bash
WOWOK_SKILLS_TARGETS=claude,trae npm install -g @wowok/skills   # subset of clients
WOWOK_SKILLS_NO_MCP=1 npm install -g @wowok/skills              # skills only
WOWOK_REFERRER=<addr|name> npm install -g @wowok/skills         # save the airdrop referrer
```

### 2 — Install into a project (team sharing, optional)

```bash
cd your-project
wowok-skills init                      # all targets, user + project scope
wowok-skills init --project            # project scope only (commit these)
wowok-skills init --target claude,cursor --project
```

Commit the generated directories (`AGENTS.md`-style sharing): every teammate gets the same skills without running anything.

## Managing skills

### Update

```bash
npm update -g @wowok/skills            # new CLI → postinstall refreshes every root
wowok-skills init --force              # force-rewrite all files
```

### Uninstall

```bash
wowok-skills uninit                    # remove skills everywhere (user + project)
wowok-skills uninit --target codex
npm uninstall -g @wowok/skills
```

> `npm uninstall` alone cannot clean up: **npm v7+ never runs `preuninstall`/`uninstall` scripts**, so removal is always an explicit `wowok-skills uninit`. MCP config entries are left in place and can be deleted from the client's own MCP panel.

### Inspect

```bash
wowok-skills list
wowok-skills get wowok-provider
wowok-skills role provider
wowok-skills recommend "create a service"
wowok-skills doctor
wowok-skills targets
```

## CLI reference

| Command | Description |
|---------|-------------|
| `wowok-skills list` | List all skills (by role) |
| `wowok-skills get <name>` | Show skill details |
| `wowok-skills role <role>` | Skills for a role (`customer\|provider\|supplier\|collaborator\|arbitrator\|shared`) |
| `wowok-skills recommend <intent>` | Recommend skills from a user intent |
| `wowok-skills init` | Install to all targets, user + project scope, and register MCP |
| `wowok-skills uninit` | Remove installed skills (MCP entries untouched) |
| `wowok-skills doctor` | Per-client install freshness + MCP registration report |
| `wowok-skills targets` | Show the target table (ids and project directories) |
| `wowok-skills referrer <addr\|name>` | Save the airdrop referrer globally |

Options: `--target <t>` (comma separated), `--user`, `--project`, `--force`, `--no-mcp`, `--referrer <addr|name>`.

Target ids: `agents`, `claude`, `codex`, `gemini`, `qwen`, `grok`, `opencode`, `antigravity`, `trae`, `cursor`, `windsurf`, `codebuddy`, `workbuddy`, `qoder`, `cline`, `kilo`, `copilot` (default: all).

## Programmatic API

```ts
import {
  getSkills,
  getSkillByName,
  getSkillBody,
  CLIENT_TARGETS,
  installSkillsForTargets,
  resolveMcpLaunch,
  statusForTargets,
} from '@wowok/skills';

const provider = getSkillByName('wowok-provider');
const body = getSkillBody('wowok-provider');     // SKILL.md without frontmatter
installSkillsForTargets(['claude', 'agents'], ['project'], process.cwd());
```

`CLIENT_TARGETS` in `src/targets.ts` is the single source of truth for skill roots **and** MCP config paths — the installer and the CLI both read it, so they can never drift apart again.

## Available skills

### Always loaded (1)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-output` | Output processing — address resolution, name mapping, amount formatting, data visualization | All |

### On-demand (12)

| Skill | Purpose | Role |
|-------|---------|------|
| `wowok-provider` | Service provider guide — create Service, Machine, Allocators, order fulfillment, fork iteration | Provider |
| `wowok-supplier` | Supplier guide — present to a Demand, fulfill sub-orders, collect settlement | Supplier |
| `wowok-collaborator` | Process collaborators — execute workflow forwards (internal staff / named operators) | Collaborator |
| `wowok-arbitrator` | Arbitration service — create Arbitration, handle disputes, organize voting, fees | Arbitrator |
| `wowok-machine` | Machine workflow design — nodes, pairs, forwards, guards, dependency-first build order | Provider |
| `wowok-order` | Buyer lifecycle — pre-purchase due diligence, order creation, progress, arbitration | Customer |
| `wowok-messenger` | Encrypted messaging — E2E communication, WTS evidence, anti-spam, Contact lifecycle | All |
| `wowok-onboard` | First-touch onboarding — business dialogue from zero to the first published Service | New users |
| `wowok-planner` | Planning — natural-language intent → Object Dependency Graph (ODG) | All |
| `wowok-auditor` | Pre-publish audit — Guard completeness, Machine soundness, fund flow, readiness | All |
| `wowok-market` | Market discovery & operations — match/discover, arbitration_score, metrics, anti-cheat | All |
| `wowok-governance` | Permission / Treasury / Personal governance — indexes, roles, fund stewardship, audit | All |

### Sunk into the MCP knowledge layer (no skill needed)

| Former skill | Now served by |
|--------------|---------------|
| `wowok-tools` | MCP `schema_query` action=`get_tool_reference` |
| `wowok-safety` | MCP `schema_query` action=`get_safety_rules` + the runtime confirm gate on every write |
| `wowok-scenario` | MCP `industry_pack_operation` actions `recommend_industry` / `list_modes` |
| `wowok-guard` | MCP `schema_query` actions `get_guard_design_patterns` / `get_guard_templates` |

Directories for these four are detected and deleted on install.

## Development

```bash
npm install
npm run build
npm run check      # tsc + SKILL.md conformance + length budget
node dist/cli.js doctor
```

`npm run check` is what CI runs (see `.github/workflows/ci.yml`), together with an idempotency smoke test of the installer.

Editing skills:

1. Edit `<skill>/SKILL.md` — `name` must equal the directory name, add new skills to `SKILL_NAMES` in `src/targets.ts`.
2. `npm run check` must pass.
3. `npm run build && node scripts/install.js` refreshes every client on your machine.

## Related projects

- **WoWok Documentation**: [https://github.com/wowok-ai/docs](https://github.com/wowok-ai/docs)

## License

MIT
