#!/usr/bin/env node
import { runInit } from '../src/init.js';
import { runMcp }  from '../src/mcp-server.js';

const [,, command, ...args] = process.argv;

// Parse --flag value pairs
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    flags[key] = next && !next.startsWith('--') ? args[++i] : true;
  }
}

switch (command) {
  case 'init':
    await runInit(flags);
    break;
  case 'mcp':
    await runMcp();
    break;
  default:
    console.error('Troxy — AI payment control\n');
    console.error('Usage:');
    console.error('  npx troxy init --key <api-key>   Set up Troxy and patch MCP clients');
    console.error('  npx troxy mcp                    Start the MCP server (used by MCP clients)');
    process.exit(command ? 1 : 0);
}
