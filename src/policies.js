import { api }               from './api.js';
import { requireJwt } from './auth.js';
import { table }             from './print.js';

const DECISION_ICON = { ALLOW: '✓', BLOCK: '✗', ESCALATE: '⏳', NOTIFY: '~', TIERED: '⊕' };

function _scope(p) {
  if (p.global !== false) return 'all MCPs';
  if (p.mcps && p.mcps.length > 0) return p.mcps.map(m => m.name || m.token_prefix || 'MCP').join(', ');
  return 'no MCPs applied';
}

const HELP = {
  list:     `  troxy policies list\n\n  Lists all policies in your account with their action, scope, status, and conditions.\n`,
  describe: `  troxy policies describe --name <policy-name>\n\n  Shows full details for a single policy.\n\n  Options:\n    --name   Name of the policy (use single quotes for names with special chars)\n`,
  create:   `  troxy policies create --name <name> --action <action> [options]\n\n  Creates a new policy. Login required.\n\n  Required:\n    --name     Policy name\n    --action   ALLOW, BLOCK, NOTIFY, or ESCALATE\n\n  Optional conditions:\n    --field      Field to match: amount, merchant_name, merchant_category,\n                 merchant_country, currency, agent_name, hour, day_of_week\n    --operator   eq, neq, gt, gte, lt, lte, contains, between\n    --value      Comparison value (e.g. 500, amazon, Monday)\n    --value2     Upper bound for 'between' operator\n\n  Scope:\n    --mcp <name>   Scope policy to a specific MCP only (default: all MCPs)\n                   Run 'troxy mcps list' to see MCP names.\n\n  Examples:\n    troxy policies create --name "Block large" --action BLOCK --field amount --operator gte --value 500\n    troxy policies create --name "Block Amazon" --action BLOCK --field merchant_name --operator contains --value amazon\n    troxy policies create --name "Cap spend" --action BLOCK --mcp "My Laptop" --field amount --operator gte --value 200\n`,
  enable:   `  troxy policies enable --name <policy-name>\n\n  Enables a disabled policy.\n\n  Options:\n    --name   Name of the policy to enable\n`,
  disable:  `  troxy policies disable --name <policy-name>\n\n  Disables a policy without deleting it.\n\n  Options:\n    --name   Name of the policy to disable\n`,
  delete:   `  troxy policies delete --name <policy-name>\n\n  Permanently deletes a policy.\n\n  Options:\n    --name   Name of the policy to delete\n`,
};

export async function runPolicies([sub, ...args], flags) {
  if (flags.help || flags.h) {
    console.log('\n' + (HELP[sub] || `  troxy policies <subcommand> [options]\n\n  Subcommands:\n    list       List all policies\n    describe   Show details for a policy\n    create     Create a new policy\n    enable     Enable a policy\n    disable    Disable a policy\n    delete     Delete a policy\n\n  Run 'troxy policies <subcommand> --help' for subcommand help.\n`));
    process.exit(0);
  }

  // Read-only subcommands work with a login session
  const readOnly = !sub || sub === 'list' || sub === 'describe';

  if (readOnly) {
    const jwt = requireJwt();
    switch (sub || 'list') {
      case 'list': {
        const data = await api.agentPolicies(jwt);
        const policies = data?.policies || [];
        if (!policies.length) { console.log('\n  No policies yet.\n'); return; }
        console.log();
        table(
          ['#', 'Name', 'Action', 'Scope', 'Status', 'Conditions', 'Applies to me'],
          policies.map(p => [
            p.priority,
            p.name,
            p.action,
            _scope(p),
            p.enabled ? 'enabled' : 'disabled',
            _condSummary(p),
            p.applies_to_me ? '✓' : '—',
          ]),
        );
        break;
      }

      case 'describe': {
        const name = flags.name;
        if (!name) { console.error('  --name is required  (tip: use single quotes for names with special chars)\n'); process.exit(1); }
        const data = await api.agentPolicies(jwt);
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

      // --mcp <name>: scope policy to a specific MCP instead of all
      let isGlobal = true;
      let mcpIds = [];
      if (flags.mcp) {
        const { tokens = [] } = await api.listTokens(jwt);
        const needle = flags.mcp.toLowerCase();
        const match = tokens.find(t =>
          (t.name  && t.name.toLowerCase()  === needle) ||
          (t.agent_name && t.agent_name.toLowerCase() === needle) ||
          (t.prefix && t.prefix.toLowerCase().startsWith(needle))
        );
        if (!match) {
          console.error(`\n  MCP "${flags.mcp}" not found. Run: troxy mcps list\n`);
          process.exit(1);
        }
        isGlobal = false;
        mcpIds   = [match.id];
        console.log(`\n  Scoping to MCP: ${match.name || match.agent_name || match.prefix}`);
      }

      const policy = await api.createPolicy(jwt, { name, action, conditions, enabled: true, global: isGlobal, mcp_ids: mcpIds });
      const scope  = isGlobal ? 'all MCPs' : (policy.mcps?.[0]?.name || flags.mcp);
      console.log(`\n  Policy "${policy.name}" created ✓  (priority: ${policy.priority}, scope: ${scope})\n`);
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
      await api.updatePolicy(jwt, policy.id, {
        name:          policy.name,
        action:        policy.action,
        description:   policy.description || '',
        conditions:    policy.conditions || [],
        or_conditions: policy.or_conditions || [],
        tiers:         policy.tiers || null,
        global:        policy.global !== false,
        enabled:       sub === 'enable',
      });
      console.log(`\n  Policy "${name}" ${sub}d ✓\n`);
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: troxy policies [list|describe|create|delete|enable|disable]\n');
      process.exit(1);
  }
}

const _isAny = x => !x.field || x.field === 'any' || x.operator === 'any';

function _condSummary(p) {
  const c = (p.conditions || []).filter(x => !_isAny(x));
  const o = (p.or_conditions || []).filter(row => (row.conditions || []).some(x => !_isAny(x)));
  const total = c.length + o.length;
  if (total === 0) return 'always';
  return `${total} condition${total > 1 ? 's' : ''}`;
}

function _condDetail(p) {
  const c  = p.conditions    || [];
  const or = p.or_conditions || [];
  const parts = [];
  const real = c.filter(x => !_isAny(x));
  if (real.length) {
    parts.push(real.map(x => `${x.field} ${x.operator} ${x.value || ''}${x.value2 ? '–'+x.value2 : ''}`).join(' AND '));
  }
  if (or.length) {
    or.forEach(row => {
      const realConds = (row.conditions || []).filter(x => !_isAny(x));
      const conds = realConds.map(x => `${x.field} ${x.operator} ${x.value || ''}`).join(' AND ');
      parts.push(`${row.action || ''}${conds ? ' if ' + conds : ''}`);
    });
  }
  return parts.length ? parts.join('\n             ') : 'none (always matches)';
}
