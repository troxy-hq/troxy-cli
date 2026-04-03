import { api }        from './api.js';
import { requireJwt } from './auth.js';
import { table } from './print.js';

export async function runCards([sub, ...args], flags) {
  const jwt = requireJwt();

  switch (sub) {
    case 'list':
    case undefined: {
      const cards = await api.listCards(jwt);
      if (!cards.length) { console.log('\n  No cards yet.\n'); return; }
      console.log();
      table(
        ['Name', 'Status', 'Budget', 'Used', 'Provider'],
        cards.map(c => [
          c.alias_name,
          c.status,
          c.monthly_budget ? `$${c.monthly_budget}` : '—',
          c.budget_used    ? `$${Number(c.budget_used).toFixed(2)}` : '$0.00',
          c.provider || '—',
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
      const cards = await api.listCards(jwt);
      const card  = cards.find(c => c.alias_name === name);
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
