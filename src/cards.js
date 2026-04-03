import { api }        from './api.js';
import { requireJwt } from './auth.js';
import { table } from './print.js';

export async function runCards([sub, ...args], flags) {
  const jwt = requireJwt();

  switch (sub) {
    case 'list':
    case undefined: {
      const data = await api.listCards(jwt);
      const cards = data?.cards || [];
      if (!cards.length) { console.log('\n  No cards yet.\n'); return; }
      console.log();
      table(
        ['Name', 'Last 4', 'Status', 'Budget', 'Used'],
        cards.map(c => [
          c.name,
          c.last4 ? `···${c.last4}` : '—',
          c.status,
          c.budget ? `$${c.budget}` : 'no limit',
          `$${Number(c.budget_used || 0).toFixed(2)}`,
        ]),
      );
      break;
    }

    case 'create': {
      const name = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const body = {
        alias_name:     name,
        monthly_budget: flags.budget ? Number(flags.budget) : null,
        provider:       flags.provider || null,
        card_number:    flags['card-number'] || null,
        status:         'active',
      };
      const card = await api.createCard(jwt, body);
      console.log(`\n  Card "${card.alias_name}" created ✓\n`);
      break;
    }

    case 'delete': {
      const name = flags.name;
      if (!name) { console.error('  --name is required\n'); process.exit(1); }
      const data = await api.listCards(jwt);
      const cards = data?.cards || [];
      const card  = cards.find(c => c.name === name);
      if (!card) { console.error(`  Card "${name}" not found\n`); process.exit(1); }
      await api.deleteCard(jwt, card.id);
      console.log(`\n  Card "${name}" deleted ✓\n`);
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: npx troxy cards [list|create|delete]\n');
      process.exit(1);
  }
}
