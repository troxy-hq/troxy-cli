import { api }                    from './api.js';
import { loadConfig, saveConfig }  from './config.js';
import { requireJwt }              from './auth.js';
import { table }                   from './print.js';

export async function runMcps([sub], flags) {
  switch (sub || 'list') {
    case 'list': {
      const jwt = requireJwt();
      const data = await api.agentMcps(jwt);
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

    case 'rename': {
      const name = flags.name;
      if (!name) { console.error('\n  Usage: troxy mcps rename --name "new-name"\n'); process.exit(1); }
      const jwt = requireJwt();
      const config = loadConfig();
      const prefix = (config?.apiKey || '').substring(0, 11);
      if (!prefix) { console.error('\n  No API key found. Run: troxy init --key txy-...\n'); process.exit(1); }
      process.stdout.write(`\n  Renaming MCP to "${name}"... `);
      const { tokens = [] } = await api.listTokens(jwt);
      const tok = tokens.find(t => t.prefix === prefix);
      if (!tok) { console.error('\nCould not find this machine\'s MCP. Run: troxy init --key txy-...\n'); process.exit(1); }
      await api.renameToken(jwt, tok.id, name);
      saveConfig({ ...config, agentName: name });
      console.log('✓');
      console.log('  Dashboard and future heartbeats will use the new name.\n');
      break;
    }

    default:
      console.error(`  Unknown subcommand: ${sub}`);
      console.error('  Usage: troxy mcps [list|rename]\n');
      process.exit(1);
  }
}
