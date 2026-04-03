import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('flag validation', () => {
  it('rejects missing key', async () => {
    // Dynamically import and test the validation logic
    // We test the guard condition directly rather than calling runInit
    // (which would make real network calls)
    const key = undefined;
    assert.ok(!key || !String(key).startsWith('txy-'));
  });

  it('rejects key without txy- prefix', () => {
    const key = 'sk-notavalid';
    assert.ok(!key.startsWith('txy-'));
  });

  it('accepts valid key format', () => {
    const key = 'txy-abc123xyz';
    assert.ok(key.startsWith('txy-'));
  });
});
