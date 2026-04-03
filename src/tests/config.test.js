import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

// Point config at a temp dir so tests don't touch ~/.troxy
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'troxy-test-'));
process.env.HOME = TMP;

const { loadConfig, saveConfig } = await import('../config.js');

describe('config', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('returns null when no config exists', () => {
    assert.equal(loadConfig(), null);
  });

  it('saves and loads config', () => {
    saveConfig({ apiKey: 'txy-test123' });
    const cfg = loadConfig();
    assert.equal(cfg.apiKey, 'txy-test123');
  });
});
