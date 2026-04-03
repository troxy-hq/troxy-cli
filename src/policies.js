import { api }        from './api.js';
import { requireJwt } from './auth.js';
import { table }      from './print.js';

export async function runPolicies([sub, ...args], flags) {
  const jwt = requireJwt();

  switch (sub) {
    case 'list':
    case undefined: {
      const policies = await api.listPolicies(jwt);
      if (!policies.length) { console.log('\n  No policies yet.\n'); return; }
      console.log();
      table(
        ['Name', 'Action', 'Priority', 'Status', 'Conditions'],
        policies.map(p => [
          p.name,
          p.action,
          p.priority,
          p.enabled ? 'enabled' : 'disabled',
          Array.isArray(p.conditions) ? `${p.conditions.length} condition(s)` : '—',
        ]),
      );
      break;
    }

    case 'create': {
      const name   = flags.name;
      const action = (flags.action || '').toUpperCase();
      if (!name)   { console.error('  --name is required\n');   process.exit(1); }
      if (!action) { console.error('  --action is required\n'); process.exit(1); }
      if (!['ALLOW','BLOCK','ESCALATE','NOTIFY'].includes(action)) {
        console.error('  --action must be ALLOW, BLOCK, ESCALATE, or NOTIFY\n');
        process.exit(1);
      }

      // Build a single condition if --field/--operator/--value are provided
      const conditions = [];
      if (flags.field) {
        if (!flags.operator) { console.error('  --operator is required with --field\n'); process.exit(1); }
        const cond = { field: flags.field, operator: flags.operator };
        if (flags.value)  cond.value  = flags.value;
        if (flags.value2) cond.value2 = flags.value2;
        conditions.push(cond);
      }

      const body = {
        name,
        action,
        conditions,
        conditions_logic: (flags.logic || 'AND').toUpperCase(),
        enabled: true,
      };

      const policy = await api.createPolicy(jwt, body);
      console.log(`\n  Policy "${policy.name}" created ✓  (priority: ${policy.priority})\n`);
      break;
    }

    case 'delete': {
      const name = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const policies = await api.listPolicies(jwt);
      const policy   = policies.find(p => p.name === name);
      if (!policy) { console.error(`  Policy "${name}" not found\n`); process.exit(1); }
      await api.deletePolicy(jwt, policy.id);
      console.log(`\n  Policy "${name}" deleted ✓\n`);
      break;
    }

    case 'enable':
    case 'disable': {
      const name    = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const policies = await api.listPolicies(jwt);
      const policy   = policies.find(p => p.name === name);
      if (!policy) { console.error(`  Policy "${name}" not found\n`); process.exit(1); }
      await api.updatePolicy(jwt, policy.id, { enabled: sub === 'enable' });
      console.log(`\n  Policy "${name}" ${sub}d ✓\n`);
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: npx troxy policies [list|create|delete|enable|disable]\n');
      process.exit(1);
  }
}
