#!/usr/bin/env node
import { runInit }                     from '../src/init.js';
import { runUninstall }                from '../src/uninstall.js';
import { runMcp }                      from '../src/mcp-server.js';
import { runLogin, clearSession, requireKey, requireJwt, loadSession, getKeySource } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
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

  case 'rotate-key': {
    const jwt = requireJwt();
    const { loadConfig, saveConfig } = await import('../src/config.js');
    const oldKey    = loadConfig()?.apiKey;
    const oldPrefix = oldKey ? oldKey.substring(0, 11) : null;
    const name      = flags.name || 'Rotated key';
    const revokeOld = !!flags['revoke-old'];

    process.stdout.write('\n  Creating new key... ');
    const result    = await api.createToken(jwt, { name });
    const newKey    = result.key;
    const newPrefix = result.prefix;
    console.log('✓');

    saveConfig({ apiKey: newKey });
    console.log('  Saved to ~/.troxy/config.json ✓');

    if (revokeOld && oldPrefix) {
      process.stdout.write(`  Revoking old key ${oldPrefix}... `);
      const { tokens = [] } = await api.listTokens(jwt);
      const old = tokens.find(t => t.prefix === oldPrefix);
      if (old) { await api.revokeToken(jwt, old.id); console.log('✓'); }
      else console.log('(already revoked)');
    }

    console.log(`
  Key rotated:
    Old:  ${oldPrefix ? oldPrefix + '...' : '(none)'}
    New:  ${newPrefix}...

  New key (shown once — save it now):
    ${newKey}

  ~/.troxy/config.json updated ✓

  ⚠  If this key runs an MCP, update TROXY_API_KEY in your MCP
     config and restart the MCP server.
`);
    break;
  }

  // ── MCP server (started by MCP clients) ───────────────────────
  case 'mcp':
    await runMcp();
    break;

  // ── Simulate a payment evaluation ────────────────────────────
  case 'pay': {
    const apiKey   = requireKey(flags);
    const merchant = flags.merchant;
    const amount   = parseFloat(flags.amount);
    const card     = flags.card || 'Work';
    const category = flags.category;
    if (!merchant)    { console.error('  --merchant is required\n'); process.exit(1); }
    if (isNaN(amount)){ console.error('  --amount is required\n');   process.exit(1); }
    const body = { card_alias: card, merchant_name: merchant, amount, agent: 'troxy-cli' };
    if (category) body.merchant_category = category;
    const result = await api.evaluate(body, apiKey);
    const ICON = { ALLOW: '✓', BLOCK: '✗', ESCALATE: '⏳', NOTIFY: '~' };
    const icon = ICON[result.decision] || '?';
    const suffix = result.policy ? `  ←  "${result.policy}"` : result.reason ? `  —  ${result.reason}` : '  (default action)';
    console.log(`\n  ${icon} ${result.decision}${suffix}`);
    if (result.audit_id) console.log(`  audit: ${result.audit_id}`);
    console.log();
    break;
  }

  // ── Resources (read-only: --key or saved config; write: login) ─
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
    const jwt    = requireJwt();
    const period = Number(flags.period || 30);
    const data   = await api.agentInsights(jwt, period);
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
    if (!sub || sub === 'policies') { await runPolicies(['list'], flags); break; }
    if (sub === 'mcps')             { await runMcps(['list'], flags);     break; }
    if (sub === 'activity')         { await runActivity(flags);           break; }
    console.error(`  Unknown resource: ${sub}. Try: policies, mcps, activity\n`);
    process.exit(1);

  // ── Status ────────────────────────────────────────────────────
  case 'status': {
    const health = await api.health();
    process.stdout.write(`\n  API:  ${health.status === 'ok' ? '✓ online' : '✗ ' + health.status}\n`);
    process.stdout.write(`  DB:   ${health.db}\n`);
    process.stdout.write(`  Env:  ${health.env}\n`);

    // Account info from login session
    const session = loadSession();
    if (session?.jwt) {
      try {
        const data = await api.agentStatus(session.jwt);
        const { account } = data;
        console.log(`
  Account
    Active policies:  ${account.active_policies}
    MCPs total:       ${account.total_mcps}  (${account.connected_mcps} connected)
    Requests 24h:     ${account.requests_24h}
    Default action:   ${account.default_action}
`);
      } catch { console.log(); }
    } else {
      console.log('\n  Not logged in. Run: troxy login\n');
    }

    // MCP connection info from local config (set by troxy init)
    const localKey = loadConfig()?.apiKey;
    if (localKey) {
      console.log(`  MCP key:  ${localKey.substring(0, 12)}...  (saved — run \`troxy init\` to change)\n`);
    }

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
  MCP setup (once per machine):   troxy init --key <api-key>
  Login for CLI commands (12h):   troxy login

  MCP Setup
    troxy init --key <api-key>     Connect this machine as an MCP + save key
    troxy rotate-key               Create new MCP key + save it
    troxy rotate-key --revoke-old  Same + revoke the old key immediately
    troxy uninstall                Remove Troxy from this machine
    troxy status                   API health + account overview

  Inspect  (requires: troxy login)
    troxy policies list
    troxy policies describe --name "Block Amazon"
    troxy mcps list
    troxy activity [--limit 50] [--mine]
    troxy insights [--period 7]

  Manage  (requires: troxy login)
    troxy policies create --name "X" --action BLOCK --field amount --operator gte --value 500
    troxy policies enable  --name "X"
    troxy policies disable --name "X"
    troxy policies delete  --name "X"

  Simulate  (requires MCP key — run troxy init first)
    troxy pay --merchant "Amazon" --amount 50 --card "Work"
    troxy pay --merchant "Google" --amount 300 --card "Work" --category software
`);
    process.exit(command ? 1 : 0);
}
} // end _run
