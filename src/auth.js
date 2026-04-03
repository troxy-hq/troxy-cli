import fs       from 'fs';
import os       from 'os';
import path     from 'path';
import readline from 'readline';
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
    console.error('\n  Not logged in. Run: npx troxy login\n');
    process.exit(1);
  }
  return session.jwt;
}

/** Interactive magic-link login flow. */
export async function runLogin({ email } = {}) {
  if (!email) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    email = await new Promise(resolve => rl.question('  Email: ', ans => { rl.close(); resolve(ans.trim()); }));
  }

  process.stdout.write(`\n  Sending magic link to ${email}... `);
  try {
    await api.magicLink(email);
    console.log('✓');
  } catch (err) {
    console.log('✗');
    console.error(`  Error: ${err.message}\n`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = await new Promise(resolve =>
    rl.question('  Enter the code from your email: ', ans => { rl.close(); resolve(ans.trim()); })
  );

  process.stdout.write('  Verifying... ');
  try {
    const result = await api.verify(token);
    saveSession({ jwt: result.access_token, email });
    console.log('✓');
    console.log(`\n  Logged in as ${email}\n`);
  } catch (err) {
    console.log('✗');
    console.error(`  Error: ${err.message}\n`);
    process.exit(1);
  }
}
