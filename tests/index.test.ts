import { describe, expect, it } from 'vitest';

describe('@nexum-io/partner-signer-sdk entry', () => {
  it('exposes exactly the v1 runtime surface: createSigner + InvalidPrivateKeyError', async () => {
    const mod = await import('../src/index.js');

    expect(Object.keys(mod).sort()).toEqual(['InvalidPrivateKeyError', 'createSigner']);
    expect(typeof mod.createSigner).toBe('function');
    expect(new mod.InvalidPrivateKeyError()).toBeInstanceOf(Error);
  });
});
