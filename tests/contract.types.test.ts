import { describe, expectTypeOf, it } from 'vitest';
import type { Address, Hex, SignableMessage } from 'viem';

import type { CreateSignerOptions, PartnerSigner } from '../src/index.js';

const typedData = {
  domain: { name: 'Partner Signer', version: '1', chainId: 137 },
  types: {
    Ping: [{ name: 'nonce', type: 'uint256' }],
  },
  primaryType: 'Ping',
  message: { nonce: 1n },
} as const;

// Type-level contract (checked by `tsc --noEmit`, never executed).
function contractV1(signer: PartnerSigner, options: CreateSignerOptions): void {
  expectTypeOf(options).toEqualTypeOf<{ readonly privateKey: Hex }>();

  expectTypeOf(signer.getAddress()).toEqualTypeOf<Address>();

  expectTypeOf(signer.signMessage).parameter(0).toEqualTypeOf<SignableMessage>();
  expectTypeOf(signer.signMessage('hello')).resolves.toEqualTypeOf<Hex>();
  expectTypeOf(signer.signMessage({ raw: '0x68656c6c6f' })).resolves.toEqualTypeOf<Hex>();

  expectTypeOf(signer.signTypedData(typedData)).resolves.toEqualTypeOf<Hex>();

  // @ts-expect-error — primaryType must be one of `types`
  signer.signTypedData({ ...typedData, primaryType: 'Pong' });

  // @ts-expect-error — the v1 surface is exactly three methods
  void signer.signTransaction;
}

describe('v1 contract types', () => {
  it('compiles against the locked surface', () => {
    expectTypeOf(contractV1).toBeFunction();
  });
});
