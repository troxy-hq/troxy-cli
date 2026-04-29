import { api }               from './api.js';
import { requireJwt }        from './auth.js';
import { table }             from './print.js';

const ICON = { ALLOW: '✓', BLOCK: '✗', ESCALATE: '⏳', NOTIFY: '~' };

export async function runActivity(flags) {
  const jwt   = requireJwt();
  const limit = Number(flags.limit || 20);
  const mine  = !!flags.mine;

  const data = await api.agentActivity(jwt, limit, mine);
  const rows = data?.activity || [];

  if (!rows.length) { console.log('\n  No activity yet.\n'); return; }

  console.log();
  table(
    ['Decision', 'Merchant', 'Category', 'Amount', 'Policy', 'Agent', 'When'],
    rows.map(r => {
      const icon = ICON[r.decision?.split('→')[0]] || ' ';
      return [
        `${icon} ${r.decision}`,
        r.merchant,
        r.category,
        r.amount ? `$${Number(r.amount).toFixed(2)}` : '—',
        r.decision_source === 'budget' ? 'budget limit' : r.policy,
        r.agent,
        r.when,
      ];
    }),
  );
}
