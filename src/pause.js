import { loadConfig } from './config.js';
import { api } from './api.js';

export async function runPause() {
  const config = loadConfig();
  const apiKey = process.env.TROXY_API_KEY || config?.apiKey;
  if (!apiKey) {
    console.error('No API key found. Run: npx troxy init --key txy-...');
    process.exit(1);
  }
  await api.mcpPause(apiKey);
  console.log('⏸  MCP paused. All payment evaluations will be blocked.');
  console.log('   Run "troxy resume" to resume.');
}

export async function runResume() {
  const config = loadConfig();
  const apiKey = process.env.TROXY_API_KEY || config?.apiKey;
  if (!apiKey) {
    console.error('No API key found. Run: npx troxy init --key txy-...');
    process.exit(1);
  }
  await api.mcpResume(apiKey);
  console.log('▶  MCP resumed. Payment evaluations are active again.');
}
