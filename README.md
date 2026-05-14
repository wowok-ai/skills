# WoWok Skills

WoWok AI Skills for Claude and other AI assistants - Helping AI use WoWok MCP tools correctly.

## Overview

WoWok Skills provide structured guidance for AI assistants to effectively use WoWok's blockchain collaboration tools. These skills solve common AI challenges:

- **Complex system building** — Dependency chains, build order, step-by-step patterns
- **Tool usage failures** — Correct parameter formats, tool selection, error recovery
- **Safety & authorization** — User confirmation for important operations

## Prerequisites

Before using WoWok Skills, you need to install the WoWok Agent (MCP Server):

```bash
npm install -g wowok_agent
```

## Installation

```bash
npm install -g wowok-skills
```

## Usage

### CLI

```bash
# List all available skills
wowok-skills list

# Get specific skill information
wowok-skills get wowok-build
```

### Programmatic API

```typescript
import { getSkills, getSkillByName } from 'wowok-skills';

// Get all skills
const skills = getSkills();

// Get specific skill
const buildSkill = getSkillByName('wowok-build');
```

## Available Skills

| Skill | Purpose |
|-------|---------|
| `wowok-build` | Complex system building (Service + Machine + Guard + Allocation + Reward) |
| `wowok-guard` | Guard design mastery (programmable trust rules) |
| `wowok-tools` | MCP tool usage mastery (13 tools, common pitfalls) |
| `wowok-safety` | Safety & authorization protocol (dry-run → confirm → execute) |
| `wowok-machine` | Machine workflow design (state machines, progress tracking) |
| `wowok-order` | Order lifecycle management (payment, allocation, arbitration) |

## Related Projects

- **WoWok Agent (MCP Server)**: [https://github.com/wowok-ai/agent](https://github.com/wowok-ai/agent)
  - MCP Server for AI agents to interact with WoWok blockchain
  - npm: `wowok_agent`

- **WoWok Documentation**: [https://github.com/wowok-ai/docs](https://github.com/wowok-ai/docs)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch
```

## License

Apache-2.0

## Links

- GitHub: [https://github.com/wowok-ai/skills](https://github.com/wowok-ai/skills)
- npm: [https://www.npmjs.com/package/wowok-skills](https://www.npmjs.com/package/wowok-skills)
- X: [https://x.com/Wowok_Ai](https://x.com/Wowok_Ai)
