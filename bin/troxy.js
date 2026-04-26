#!/usr/bin/env node
import { runInit }                     from '../src/init.js';
import { runUninstall }                from '../src/uninstall.js';
import { runMcp }                      from '../src/mcp-server.js';
import { runLogin, clearSession, requireKey, getKeySource } from '../src/auth.js';
import { runCards }                    from '../src/cards.js';
import { runPolicies }                 from '../src/policies.js';
import { runMcps }                     from '../src/mcps.js';
import { runActivity }                 from '../src/activity.js';
import { api }                         from '../src/api.js';
import { table }                       from '../src/print.js';

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

try { await _run(); } catch (err) { _handleError(err); }

function _handleError(err) {
  if (err.code === 'UNAUTHORIZED') {
    const source = getKeySource();
    if (source === 'config') {
      console.error('\n  API key revoked or invalid.');
      console.error('  Your saved key is no longer accepted by Troxy.');
      console.error('  Run: npx troxy init --key <new-key>  to reconnect.\n');
    } else {
      console.error('\n  API key invalid or revoked.');
      console.error('  Check the key in your Troxy dashboard → Connections.\n');
    }
  } else {
    console.error(`\n  Error: ${err.message}\n`);
  }
  process.exit(1);
}

async function _run() {
switch (command) {
  // ── Setup ─────────────────────────────────────────────────────
  case 'init':
    await runInit(flags);
    break;

  case 'uninstall':
    await runUninstall();
    break;

  // ── Auth ──────────────────────────────────────────────────────
  case 'connect': {
    const k = flags.key;
    if (!k || !k.startsWith('txy-')) {
      console.error('\n  Usage: troxy connect --key txy-...\n');
      process.exit(1);
    }
    // Validate key before saving
    process.stdout.write('\n  Validating key... ');
    await api.agentStatus(k);
    console.log('✓');
    const { saveConfig } = await import('../src/config.js');
    saveConfig({ apiKey: k });
    console.log('  Key saved to ~/.troxy/config.json\n');
    break;
  }

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

  // ── Resources (read-only: --key or saved config; write: login) ─
  case 'cards':
    await runCards(positional, flags);
    break;

  case 'policies':
    await runPolicies(positional, flags);
    break;

  case 'mcps':
    await runMcps(positional, flags);
    break;

  case 'activity':
    await runActivity(flags);
    break;

  case 'insights': {
    const apiKey = requireKey(flags);
    const period = Number(flags.period || 30);
    const data   = await api.agentInsights(apiKey, period);
    const d      = data;
    console.log(`
  Insights — last ${d.period_days} days
  ──────────────────────────────────
  Total requests:  ${d.total_requests}
  Total spent:     $${Number(d.total_spent).toFixed(2)}
  Total blocked:   $${Number(d.total_blocked).toFixed(2)}

  Decisions
    ALLOW:     ${d.decisions.ALLOW}
    BLOCK:     ${d.decisions.BLOCK}
    ESCALATE:  ${d.decisions.ESCALATE}
    NOTIFY:    ${d.decisions.NOTIFY}
`);
    if (d.top_merchants?.length) {
      console.log('  Top merchants');
      table(
        ['Merchant', 'Requests', 'Total Spend'],
        d.top_merchants.map(m => [m.merchant, m.requests, `$${Number(m.total).toFixed(2)}`]),
      );
    }
    break;
  }

  // ── Shorthand: troxy list [resource] ──────────────────────────
  case 'list':
    if (!sub || sub === 'cards')    { await runCards(['list'], flags);    break; }
    if (sub === 'policies')         { await runPolicies(['list'], flags); break; }
    if (sub === 'mcps')             { await runMcps(['list'], flags);     break; }
    if (sub === 'activity')         { await runActivity(flags);           break; }
    console.error(`  Unknown resource: ${sub}. Try: cards, policies, mcps, activity\n`);
    process.exit(1);

  // ── Status ────────────────────────────────────────────────────
  case 'status': {
    const health = await api.health();
    process.stdout.write(`\n  API:  ${health.status === 'ok' ? '✓ online' : '✗ ' + health.status}\n`);
    process.stdout.write(`  DB:   ${health.db}\n`);
    process.stdout.write(`  Env:  ${health.env}\n`);

    // If we have a key, show enriched status
    try {
      const apiKey  = requireKey(flags);
      const source  = getKeySource();
      const data    = await api.agentStatus(apiKey);
      const { token, account } = data;
      const keyNote = source === 'config'
        ? '(saved — run `troxy init` to change)'
        : source === 'env' ? '(from TROXY_API_KEY env)' : '(passed via --key)';
      console.log(`
  Key:      ${token.prefix}  ${keyNote}
  MCP:      ${token.connected ? '● connected' : '○ offline'}  last seen ${token.last_seen}
  Fallback: ${token.default_action}

  Account
    Active policies:  ${account.active_policies}
    MCPs total:       ${account.total_mcps}  (${account.connected_mcps} connected)
    Requests 24h:     ${account.requests_24h}
    Default action:   ${account.default_action}
`);
    } catch (err) { if (err.code === 'UNAUTHORIZED') throw err; console.log(); }

    // Version check
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const { version: current } = require('../package.json');
      const res  = await fetch('https://registry.npmjs.org/troxy-cli/latest', { signal: AbortSignal.timeout(3000) });
      const { version: latest } = await res.json();
      if (current !== latest) {
        console.log(`  ⚠  New version available: ${latest} (you have ${current})`);
        console.log(`     Update with: sudo npm install -g troxy-cli@latest\n`);
      }
    } catch {}

    break;
  }

  // ── Help / default ────────────────────────────────────────────
  default:
    if (command) console.error(`  Unknown command: ${command}\n`);
    console.log(`
  Troxy — AI payment control

  First time on a machine?  Run: npx troxy init --key <api-key>
  This saves your key to ~/.troxy/config.json — no need to pass --key again.

  Setup
    troxy connect --key <api-key>  Save API key (CLI only — no MCP setup)
    troxy init --key <api-key>     Full setup: save key + configure MCP
    troxy uninstall                Remove Troxy from this machine
    troxy status                   API health + which key is in use

  Inspect  (uses saved key — no flags needed after init)
    troxy policies list
    troxy policies describe --name "Block Amazon"
    troxy mcps list
    troxy cards list
    troxy activity [--limit 50] [--mine]
    troxy insights [--period 7]

  Manage  (requires: npx troxy login)
    troxy policies create --name "X" --action BLOCK --field amount --operator gte --value 500
    troxy policies enable  --name "X"
    troxy policies disable --name "X"
    troxy policies delete  --name "X"
    troxy cards create --name "Personal" [--budget 500]
    troxy cards delete --name "Personal"

  Override key for a single command:  --key txy-...
`);
    process.exit(command ? 1 : 0);
}
} // end _run
