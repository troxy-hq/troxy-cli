import fs       from 'fs';
import os       from 'os';
import path     from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { api }  from './api.js';

const SESSION_FILE = path.join(os.homedir(), '.troxy', 'session.json');

export function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveSession(data) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

export function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

/** Require a valid JWT session or exit with a helpful message. */
export function requireJwt() {
  const session = loadSession();
  if (!session?.jwt) {
    console.error('\n  Not logged in. Run: troxy login\n');
    process.exit(1);
  }
  return session.jwt;
}

// Tracks how the last key was resolved — read by bin/troxy.js error handler
let _lastKeySource = null;

export function getKeySource() { return _lastKeySource; }

/**
 * Resolve API key: --key flag → TROXY_API_KEY env → saved config (~/.troxy/config.json).
 * Exits with a helpful message if nothing is found.
 */
export function requireKey(flags = {}) {
  if (flags.key) {
    _lastKeySource = 'flag';
    return flags.key;
  }
  if (process.env.TROXY_API_KEY) {
    _lastKeySource = 'env';
    return process.env.TROXY_API_KEY;
  }
  const saved = loadConfig()?.apiKey;
  if (saved) {
    _lastKeySource = 'config';
    return saved;
  }
  console.error('\n  No API key found.');
  console.error('  Run: npx troxy init --key txy-...  to connect this machine.\n');
  process.exit(1);
}

function loadConfig() {
  const p = path.join(os.homedir(), '.troxy', 'config.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function _openBrowser(url) {
  const isHeadless = process.platform === 'linux'
    && !process.env.DISPLAY
    && !process.env.WAYLAND_DISPLAY;
  if (isHeadless) return;
  const cmd = process.platform === 'darwin' ? `open "${url}"`
            : process.platform === 'win32'  ? `start "" "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

/** Device-code login flow — opens browser, user copies code back to CLI. */
export async function runLogin() {
  // 1. Start a CLI auth session
  let session;
  try {
    session = await api.cliStart();
  } catch (err) {
    console.error(`\n  Error starting login: ${err.message}\n`);
    process.exit(1);
  }

  // 2. Open browser (or print URL on headless servers)
  const isHeadless = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  if (isHeadless) {
    console.log('\n  Open this URL in your browser to get a login code:\n');
    console.log(`  ${session.url}\n`);
  } else {
    console.log('\n  Opening browser to complete login...');
    console.log(`  If it didn't open, visit:\n  ${session.url}\n`);
    _openBrowser(session.url);
  }

  // 3. Prompt for the code shown in the browser (masked like a password)
  const code = await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: null });
    process.stdout.write('  Paste the code from your browser: ');
    let buf = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = ch => {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(buf.trim());
      } else if (ch === '\u0003') { // Ctrl-C
        process.stdout.write('\n');
        process.exit(0);
      } else if (ch === '\u007f' || ch === '\b') { // backspace
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    process.stdin.on('data', onData);
  });

  if (!code) {
    console.error('\n  No code entered. Run troxy login to try again.\n');
    process.exit(1);
  }

  // 4. Exchange code for JWT
  process.stdout.write('  Verifying... ');
  try {
    const result = await api.cliExchange(session.session_id, code);
    saveSession({ jwt: result.access_token, email: result.email });
    console.log('✓');
    console.log(`\n  Logged in as ${result.email}  (session valid for 12 hours)\n`);
  } catch (err) {
    console.log('✗');
    console.error(`  Error: ${err.message}\n`);
    process.exit(1);
  }
}
