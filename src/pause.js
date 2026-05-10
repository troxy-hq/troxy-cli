import { loadConfig } from './config.js';
import { requireJwt } from './auth.js';
import { api } from './api.js';

async function _localTokenId(jwt, config) {
  const prefix = (config?.apiKey || '').substring(0, 11);
  if (!prefix) throw new Error('No API key found. Run: troxy init --key txy-...');
  const { tokens = [] } = await api.listTokens(jwt);
  const tok = tokens.find(t => t.prefix === prefix);
  if (!tok) throw new Error('This machine\'s MCP key was not found in your account. Run: troxy init --key txy-...');
  return tok.id;
}

export async function runPause() {
  const jwt = requireJwt();
  const config = loadConfig();
  process.stdout.write('\n  Pausing MCP... ');
  const id = await _localTokenId(jwt, config);
  await api.pauseToken(jwt, id);
  console.log('✓');
  console.log('  ⏸  All payment evaluations are now blocked.');
  console.log('  Run "troxy resume" to resume.\n');
}

export async function runResume() {
  const jwt = requireJwt();
  const config = loadConfig();
  process.stdout.write('\n  Resuming MCP... ');
  const id = await _localTokenId(jwt, config);
  await api.resumeToken(jwt, id);
  console.log('✓');
  console.log('  ▶  Payment evaluations are active again.\n');
}
