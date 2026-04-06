import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import readline       from 'readline';
import { execSync }   from 'child_process';
import { saveConfig } from './config.js';
import { evaluatePayment } from './api.js';

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

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

  // Validate the key by hitting /evaluate (404 card = key is valid, TypeError = network failure)
  process.stdout.write('  Validating API key...  ');
  try {
    await evaluatePayment(
      { agent: 'troxy-init', card_alias_name: '__ping__', amount: 0 },
      key,
    );
    console.log('✓');
  } catch (err) {
    if (err instanceof TypeError) {
      // Actual network failure — couldn't reach the API at all
      console.log('✗');
      console.error('\n  Error: Could not reach Troxy API. Check your internet connection.\n');
      process.exit(1);
    }
    // API was reachable — check what it said
    if (err.message?.toLowerCase().includes('invalid') || err.message?.toLowerCase().includes('revoked')) {
      console.log('✗');
      console.error('\n  Error: Invalid or revoked API key.\n');
      process.exit(1);
    }
    // 404 (card not found) or any other API error = key is valid, API is up
    console.log('✓');
  }

  // Ask for agent name
  const agentName = await prompt('  What would you like to name this agent? (e.g. "Shopping Bot"): ');
  if (!agentName) {
    console.error('\n  Error: agent name is required.\n');
    process.exit(1);
  }

  // Save config
  saveConfig({ apiKey: key, agentName });
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

  // Install background service so MCP server survives reboots
  console.log('\n  Setting up background service...');
  try {
    installService(key, agentName);
    console.log('  Background service installed  ✓');
  } catch (err) {
    console.log(`  Background service  ✗  (${err.message})`);
    console.log('  You can start it manually with: troxy mcp &');
  }

  console.log('\n  Your payments are now protected.');
  console.log('  Dashboard → https://dash.troxy.io\n');
}

function installService(apiKey, agentName) {
  const platform = process.platform;
  let troxy;
  try {
    troxy = execSync('which troxy').toString().trim();
  } catch {
    troxy = '/usr/local/bin/troxy';
  }

  if (platform === 'linux') {
    const unit = `[Unit]
Description=Troxy MCP Server
After=network.target

[Service]
ExecStart=${troxy} mcp
Restart=always
RestartSec=10
User=${os.userInfo().username}
Environment=TROXY_API_KEY=${apiKey}
Environment=TROXY_AGENT_NAME="${agentName}"

[Install]
WantedBy=multi-user.target
`;
    fs.writeFileSync('/tmp/troxy-mcp.service', unit);
    execSync('sudo mv /tmp/troxy-mcp.service /etc/systemd/system/troxy-mcp.service');
    execSync('sudo systemctl daemon-reload');
    execSync('sudo systemctl enable troxy-mcp');
    execSync('sudo systemctl restart troxy-mcp');

  } else if (platform === 'darwin') {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.troxy.mcp</string>
  <key>ProgramArguments</key>
  <array>
    <string>${troxy}</string>
    <string>mcp</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TROXY_API_KEY</key>
    <string>${apiKey}</string>
    <key>TROXY_AGENT_NAME</key>
    <string>${agentName}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`;
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/ai.troxy.mcp.plist');
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist);
    try { execSync(`launchctl unload ${plistPath} 2>/dev/null`); } catch {}
    execSync(`launchctl load ${plistPath}`);

  } else {
    throw new Error('Auto-start not supported on this platform. Start manually: troxy mcp &');
  }
}

function mcpEntry(apiKey) {
  return {
    troxy: {
      command: 'npx',
      args:    ['troxy-cli', 'mcp'],
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
