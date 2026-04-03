#!/usr/bin/env node
import { runInit }     from '../src/init.js';
import { runMcp }      from '../src/mcp-server.js';
import { runLogin, clearSession } from '../src/auth.js';
import { runCards }    from '../src/cards.js';
import { runPolicies } from '../src/policies.js';
import { runActivity } from '../src/activity.js';
import { api }         from '../src/api.js';
import { requireJwt }  from '../src/auth.js';
import { table }       from '../src/print.js';

const [,, command, sub, ...rest] = process.argv;
const allArgs = [sub, ...rest].filter(Boolean);

// Parse --flag value pairs
const flags = {};
const positional = [];
for (let i = 0; i < allArgs.length; i++) {
  if (allArgs[i].startsWith('--')) {
    const key  = allArgs[i].slice(2);
    const next = allArgs[i + 1];
    flags[key] = next && !next.startsWith('--') ? allArgs[++i] : true;
  } else {
    positional.push(allArgs[i]);
  }
}

switch (command) {
  // ── Setup ─────────────────────────────────────────────────────
  case 'init':
    await runInit(flags);
    break;

  // ── Auth ──────────────────────────────────────────────────────
  case 'login':
    await runLogin(flags);
    break;

  case 'logout':
    clearSession();
    console.log('\n  Logged out ✓\n');
    break;

  // ── MCP server (started by MCP clients) ───────────────────────
  case 'mcp':
    await runMcp();
    break;

  // ── Resources ─────────────────────────────────────────────────
  case 'cards':
    await runCards(positional, flags);
    break;

  case 'policies':
    await runPolicies(positional, flags);
    break;

  case 'activity':
    await runActivity(flags);
    break;

  // ── Status ────────────────────────────────────────────────────
  case 'status': {
    const health = await api.health();
    console.log(`\n  API:  ${health.status === 'ok' ? '✓ online' : '✗ ' + health.status}`);
    console.log(`  DB:   ${health.db}`);
    console.log(`  Env:  ${health.env}\n`);
    break;
  }

  // ── Help / default ────────────────────────────────────────────
  default:
    if (command) console.error(`  Unknown command: ${command}\n`);
    console.log(`
  Troxy — AI payment control

  Setup
    npx troxy init --key <api-key>      Initialize and patch MCP clients
    npx troxy login                     Log in to your dashboard account
    npx troxy logout                    Clear local session
    npx troxy status                    Check API health

  Cards
    npx troxy cards list
    npx troxy cards create --name "Personal" [--budget 500] [--provider stripe]
    npx troxy cards delete --name "Personal"

  Policies
    npx troxy policies list
    npx troxy policies create --name "Block high" --action BLOCK --field amount --operator gte --value 100
    npx troxy policies enable  --name "Block high"
    npx troxy policies disable --name "Block high"
    npx troxy policies delete  --name "Block high"

  Activity
    npx troxy activity [--limit 50]
`);
    process.exit(command ? 1 : 0);
}
