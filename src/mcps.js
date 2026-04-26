import { api }       from './api.js';
import { loadConfig } from './config.js';
import { requireKey } from './auth.js';
import { table }      from './print.js';

export async function runMcps([sub], flags) {
  const apiKey = requireKey(flags);

  switch (sub || 'list') {
    case 'list': {
      const data = await api.agentMcps(apiKey);
      const mcps = data?.mcps || [];
      if (!mcps.length) { console.log('\n  No MCP connections yet.\n'); return; }
      console.log();
      table(
        ['Name', 'Prefix', 'Status', 'Last Seen', 'Policies', 'Default Action', 'Me'],
        mcps.map(m => [
          m.name,
          m.token_prefix,
          m.connected ? '● connected' : '○ offline',
          m.last_seen,
          m.policies_assigned,
          m.default_action,
          m.is_me ? '← you' : '',
        ]),
      );
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: troxy mcps [list]\n');
      process.exit(1);
  }
}
