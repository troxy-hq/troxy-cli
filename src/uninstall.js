import fs           from 'fs';
import os           from 'os';
import path         from 'path';
import { execSync } from 'child_process';
import readline     from 'readline';

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

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function removeService() {
  const platform = process.platform;

  if (platform === 'linux') {
    try { execSync('sudo systemctl stop troxy-mcp 2>/dev/null');    } catch {}
    try { execSync('sudo systemctl disable troxy-mcp 2>/dev/null'); } catch {}
    try { execSync('sudo rm -f /etc/systemd/system/troxy-mcp.service'); } catch {}
    try { execSync('sudo systemctl daemon-reload');                  } catch {}
    return true;

  } else if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/ai.troxy.mcp.plist');
    if (fs.existsSync(plistPath)) {
      try { execSync(`launchctl unload ${plistPath} 2>/dev/null`); } catch {}
      fs.unlinkSync(plistPath);
    }
    return true;
  }

  return false;
}

function removeMcpEntries() {
  const platform = process.platform;
  const patched = [];

  for (const client of MCP_CLIENTS) {
    const configPath = client.path[platform] ?? client.path.linux;
    if (!fs.existsSync(configPath)) continue;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.mcpServers?.troxy) {
        delete config.mcpServers.troxy;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        patched.push(client.name);
      }
    } catch {
      // malformed config — skip
    }
  }

  return patched;
}

export async function runUninstall() {
  console.log('\n  Troxy — Uninstall\n');

  const answer = await prompt('  This will remove Troxy from this machine. Continue? (y/N): ');
  if (answer.toLowerCase() !== 'y') {
    console.log('\n  Cancelled.\n');
    process.exit(0);
  }

  // 1. Stop and remove background service
  process.stdout.write('  Stopping background service...  ');
  const removed = removeService();
  console.log(removed ? '✓' : 'skipped (not supported on this platform)');

  // 2. Remove troxy from MCP client configs
  process.stdout.write('  Removing from MCP clients...  ');
  const patched = removeMcpEntries();
  if (patched.length > 0) {
    console.log(`✓  (${patched.join(', ')})`);
    console.log('  Restart your MCP client to complete removal.');
  } else {
    console.log('none found');
  }

  // 3. Delete ~/.troxy config
  process.stdout.write('  Removing config (~/.troxy)...  ');
  const configDir = path.join(os.homedir(), '.troxy');
  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true, force: true });
    console.log('✓');
  } else {
    console.log('not found');
  }

  console.log('\n  Troxy removed. Your payments are no longer protected by Troxy.\n');
}
