import { api }               from './api.js';
import { requireJwt, requireKey } from './auth.js';
import { table }             from './print.js';

const DECISION_ICON = { ALLOW: '✓', BLOCK: '✗', ESCALATE: '⏳', NOTIFY: '~', TIERED: '⊕' };
const SCOPE_COLOR   = { 'all MCPs': 'all MCPs', 'this MCP': '→ me', 'other MCPs': 'no MCPs applied' };

export async function runPolicies([sub, ...args], flags) {
  // Read-only subcommands work with just an API key
  const readOnly = !sub || sub === 'list' || sub === 'describe';

  if (readOnly) {
    const apiKey = requireKey(flags);
    switch (sub || 'list') {
      case 'list': {
        const data = await api.agentPolicies(apiKey);
        const policies = data?.policies || [];
        if (!policies.length) { console.log('\n  No policies yet.\n'); return; }
        console.log();
        table(
          ['#', 'Name', 'Action', 'Scope', 'Status', 'Conditions', 'Applies to me'],
          policies.map(p => [
            p.priority,
            p.name,
            p.action,
            SCOPE_COLOR[p.scope] || p.scope,
            p.enabled ? 'enabled' : 'disabled',
            _condSummary(p),
            p.applies_to_me ? '✓' : '—',
          ]),
        );
        break;
      }

      case 'describe': {
        const name = flags.name;
        if (!name) { console.error('  --name is required\n'); process.exit(1); }
        const data = await api.agentPolicies(apiKey);
        const p = (data?.policies || []).find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!p) { console.error(`  Policy "${name}" not found\n`); process.exit(1); }

        console.log(`
  Name:          ${p.name}
  Action:        ${p.action}
  Priority:      ${p.priority}
  Status:        ${p.enabled ? 'enabled' : 'disabled'}
  Scope:         ${p.scope}
  Applies here:  ${p.applies_to_me ? 'yes' : 'no'}
  MCPs:          ${p.mcps.length ? p.mcps.map(m => m.name).join(', ') : p.global ? 'all MCPs' : 'none'}
  Conditions:    ${_condDetail(p)}
  Created:       ${new Date(p.created_at).toLocaleDateString()}
`);
        break;
      }
    }
    return;
  }

  // Write subcommands need JWT
  const jwt = requireJwt();

  switch (sub) {
    case 'create': {
      const name   = flags.name;
      const action = (flags.action || '').toUpperCase();
      if (!name)   { console.error('  --name is required\n');   process.exit(1); }
      if (!action) { console.error('  --action is required\n'); process.exit(1); }
      if (!['ALLOW','BLOCK','ESCALATE','NOTIFY'].includes(action)) {
        console.error('  --action must be ALLOW, BLOCK, ESCALATE, or NOTIFY\n');
        process.exit(1);
      }
      const conditions = [];
      if (flags.field) {
        if (!flags.operator) { console.error('  --operator is required with --field\n'); process.exit(1); }
        const cond = { field: flags.field, operator: flags.operator };
        if (flags.value)  cond.value  = flags.value;
        if (flags.value2) cond.value2 = flags.value2;
        conditions.push(cond);
      }
      const policy = await api.createPolicy(jwt, { name, action, conditions, enabled: true });
      console.log(`\n  Policy "${policy.name}" created ✓  (priority: ${policy.priority})\n`);
      break;
    }

    case 'delete': {
      const name = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const { policies = [] } = await api.listPolicies(jwt);
      const policy = policies.find(p => p.name === name);
      if (!policy) { console.error(`  Policy "${name}" not found\n`); process.exit(1); }
      await api.deletePolicy(jwt, policy.id);
      console.log(`\n  Policy "${name}" deleted ✓\n`);
      break;
    }

    case 'enable':
    case 'disable': {
      const name = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const { policies = [] } = await api.listPolicies(jwt);
      const policy = policies.find(p => p.name === name);
      if (!policy) { console.error(`  Policy "${name}" not found\n`); process.exit(1); }
      await api.updatePolicy(jwt, policy.id, { enabled: sub === 'enable' });
      console.log(`\n  Policy "${name}" ${sub}d ✓\n`);
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: troxy policies [list|describe|create|delete|enable|disable]\n');
      process.exit(1);
  }
}

function _condSummary(p) {
  const c = p.conditions || [];
  const o = p.or_conditions || [];
  const total = c.length + o.length;
  if (total === 0) return 'always';
  return `${total} condition${total > 1 ? 's' : ''}`;
}

function _condDetail(p) {
  const c = p.conditions || [];
  if (!c.length) return 'none (always matches)';
  return c.map(x => `${x.field} ${x.operator} ${x.value || ''}${x.value2 ? '–'+x.value2 : ''}`).join(' AND ');
}
