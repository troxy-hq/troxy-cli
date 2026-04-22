# troxy-cli

The official Troxy CLI — onboard AI agents, manage cards and policies from the terminal.

## Install

```bash
npm install -g troxy-cli
```

Or run without installing:

```bash
npx troxy-cli <command>
```

## Commands

| Command | Description |
|---------|-------------|
| `troxy init` | Connect an agent to Troxy — validates API key, sets agent name, writes config |
| `troxy login` | Authenticate via magic-link code (enter the code from your email) |
| `troxy cards` | List card aliases |
| `troxy policies` | List policies |
| `troxy activity` | View recent transaction audit log |
| `troxy status` | Show current config and connection status |

## How it works

1. User runs `troxy init --key txy-...` in their agent project
2. CLI validates the key against `api.troxy.io`, prompts for agent name
3. Writes a `.troxy/config.json` to the project directory
4. Agent uses the config to call `/evaluate` before every payment

## MCP Server

The CLI also ships an MCP server (`src/mcp-server.js`) that exposes Troxy as a tool for Claude and other MCP-compatible agents.

## Auth flow

`troxy login` triggers the same magic-link flow as the dashboard:
- Sends a code to your email
- Prompts you to enter the `XXXX-XXXX` code in the terminal
- Stores the JWT locally for subsequent CLI calls

## Stack

- Node.js 18+ (ESM)
- Zero runtime dependencies except `@modelcontextprotocol/sdk`
- Published to npm as `troxy-cli`

## Related repos

| Repo | Description |
|------|-------------|
| [troxy-tf-live](https://github.com/troxy-hq/troxy-tf-live) | Backend API the CLI talks to |
| [troxy-dashboard](https://github.com/troxy-hq/troxy-dashboard) | Web dashboard alternative |
