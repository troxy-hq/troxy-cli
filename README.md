# troxy-cli

The official Troxy CLI — onboard AI agents, manage MCPs and policies from the terminal.

## Prerequisites

Node.js 18+ is required. Run `node -v` — if you get a version, skip this.

**Amazon Linux / RHEL / CentOS**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

**Ubuntu / Debian**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

**macOS**
```bash
brew install node
```

**Any system (nvm)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Verify: `node --version` and `npx --version` should both return a version.

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
| `troxy init` | Connect an agent to Troxy — validates API key, sets agent name, patches MCP configs |
| `troxy login` | Start a 12-hour CLI session (opens browser → copy code → paste into terminal) |
| `troxy mcps` | List connected MCP agents and their status |
| `troxy policies` | List and manage policies |
| `troxy activity` | View recent transaction audit log |
| `troxy insights` | Spending stats and decision breakdown |
| `troxy status` | Show connection status and account overview |

## How it works

1. User runs `troxy init --key txy-...` in their agent project
2. CLI validates the key against `api.troxy.io`, prompts for agent name
3. Writes a `.troxy/config.json` to the project directory
4. Agent uses the config to call `/evaluate` before every payment

## MCP Server

The CLI also ships an MCP server (`src/mcp-server.js`) that exposes Troxy as a tool for Claude and other MCP-compatible agents.

## Auth flow

`troxy login` uses a device-code flow:
- Opens your browser to the Troxy login page
- You log in and copy the code shown on the page
- Paste the code into the terminal
- Stores the JWT locally for 12 hours

## Stack

- Node.js 18+ (ESM)
- Zero runtime dependencies except `@modelcontextprotocol/sdk`
- Published to npm as `troxy-cli`

## Related repos

| Repo | Description |
|------|-------------|
| [troxy-tf-live](https://github.com/troxy-hq/troxy-tf-live) | Backend API the CLI talks to |
| [troxy-dashboard](https://github.com/troxy-hq/troxy-dashboard) | Web dashboard alternative |
