import fs   from 'fs';
import os   from 'os';
import path from 'path';

const CONFIG_DIR  = path.join(os.homedir(), '.troxy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveConfig(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}
