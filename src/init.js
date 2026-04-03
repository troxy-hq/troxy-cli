import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { saveConfig }       from './config.js';
import { evaluatePayment }  from './api.js';

// MCP config locations per client and platform
const MCP_CLIENTS = [
  {
    name: 'Claude Desktop',
    path: {
      darwin: path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'),
      win32:  path.join(process.env.APPDATA || os.homedir(), 'Claude/claude_desktop_config.json'),
      linux:  path.join(os.homedir(), '.config/claude/claude_desktop_config.json'),
    },
  },
  {
    name: 'Cursor',
    path: {
      darwin: path.join(os.homedir(), '.cursor/mcp.json'),
      win32:  path.join(os.homedir(), '.cursor/mcp.json'),
      linux:  path.join(os.homedir(), '.cursor/mcp.json'),
    },
  },
  {
    name: 'Windsurf',
    path: {
      darwin: path.join(os.homedir(), '.codeium/windsurf/mcp_config.json'),
      win32:  path.join(os.homedir(), '.codeium/windsurf/mcp_config.json'),
      linux:  path.join(os.homedir(), '.codeium/windsurf/mcp_config.json'),
    },
  },
];

export async function runInit({ key } = {}) {
  if (!key || !key.startsWith('txy-')) {
    console.error('\n  Error: --key is required and must start with txy-');
    console.error('  Usage: npx troxy init --key txy-...\n');
    process.exit(1);
  }

  console.log('\n  Troxy — AI payment control\n');

  // Validate the key by hitting /evaluate (404 card = key is valid)
  process.stdout.write('  Validating API key...  ');
  try {
    const result = await evaluatePayment(
      { agent: 'troxy-init', card_alias: '__ping__', amount: 0 },
      key,
    );
    if (result.error === 'invalid or revoked API key') {
      console.log('✗');
      console.error('\n  Error: Invalid or revoked API key.\n');
      process.exit(1);
    }
    console.log('✓');
  } catch {
    console.log('✗');
    console.error('\n  Error: Could not reach Troxy API. Check your internet connection.\n');
    process.exit(1);
  }

  // Save config
  saveConfig({ apiKey: key });
  console.log('  Config saved (~/.troxy/config.json)  ✓');

  // Detect and patch MCP clients
  const platform = process.platform;
  const detected = MCP_CLIENTS.filter(c => {
    const p = c.path[platform] ?? c.path.linux;
    return fs.existsSync(p);
  });

  if (detected.length === 0) {
    console.log('\n  No MCP clients detected (Claude Desktop, Cursor, Windsurf).');
    console.log('  Troxy MCP server config:\n');
    console.log(JSON.stringify(mcpEntry(key), null, 4));
    console.log('\n  Add the above to your MCP client\'s config under "mcpServers".\n');
  } else {
    console.log('\n  MCP clients found:');
    for (const client of detected) {
      const configPath = client.path[platform] ?? client.path.linux;
      try {
        patchMcpConfig(configPath, key);
        console.log(`    • ${client.name}  ✓`);
      } catch (err) {
        console.log(`    • ${client.name}  ✗  (${err.message})`);
      }
    }
    console.log('\n  Restart your MCP client to activate Troxy.');
  }

  console.log('\n  Your payments are now protected.');
  console.log('  Dashboard → https://dashboard.troxy.ai\n');
}

function mcpEntry(apiKey) {
  return {
    troxy: {
      command: 'npx',
      args:    ['troxy', 'mcp'],
      env:     { TROXY_API_KEY: apiKey },
    },
  };
}

function patchMcpConfig(configPath, apiKey) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // file exists but is empty or malformed — start fresh
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.troxy = mcpEntry(apiKey).troxy;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
