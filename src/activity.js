import { api }        from './api.js';
import { requireJwt } from './auth.js';
import { table }      from './print.js';

const DECISION_ICON = { ALLOW: '✓', BLOCK: '✗', ESCALATE: '⏳', NOTIFY: '~' };

export async function runActivity(flags) {
  const jwt   = requireJwt();
  const limit = Number(flags.limit || 20);
  const rows  = await api.activity(jwt, limit);

  if (!rows.length) { console.log('\n  No activity yet.\n'); return; }

  console.log();
  table(
    ['Decision', 'Agent', 'Merchant', 'Amount', 'Policy', 'Time'],
    rows.map(r => [
      `${DECISION_ICON[r.decision] || ' '} ${r.decision}`,
      r.agent_name || 'unknown',
      r.merchant_name || '—',
      r.amount ? `$${Number(r.amount).toFixed(2)}` : '—',
      r.policy_name || '—',
      new Date(r.created_at).toLocaleString(),
    ]),
  );
}
