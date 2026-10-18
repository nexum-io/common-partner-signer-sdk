import { describe, expect, it } from 'vitest';

import { typedDataFromJson } from '../src/typed-data-json.js';
import { TYPED_DATA_JSON, TYPED_DATA_VIEM } from './fixtures.js';

const UINT256_MAX = (1n << 256n) - 1n;

describe('typedDataFromJson — JSON payload → viem typed data', () => {
  it('converts integer-typed fields (strings and numbers, nested structs, arrays) to bigint', () => {
    const converted = typedDataFromJson(TYPED_DATA_JSON);

    expect(converted).toEqual(TYPED_DATA_VIEM);
  });

  it('leaves string, address, bool and bytes fields untouched', () => {
    const input = {
      domain: { name: 'x', version: '1', chainId: 1 },
      types: {
        Ping: [
          { name: 'note', type: 'string' },
          { name: 'wallet', type: 'address' },
          { name: 'ok', type: 'bool' },
          { name: 'hash', type: 'bytes32' },
        ],
      },
      primaryType: 'Ping',
      message: {
        note: '123',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
        ok: true,
        hash: `0x${'ab'.repeat(32)}`,
      },
    };

    expect(typedDataFromJson(input).message).toEqual(input.message);
  });

  it('rejects a non-integer value in an integer field, naming the field path', () => {
    const input = {
      ...TYPED_DATA_JSON,
      message: { ...TYPED_DATA_JSON.message, amount: 'lots' },
    };

    expect(() => typedDataFromJson(input)).toThrow(/message\.amount/);
  });

  it('passes unknown struct names through so viem reports them', () => {
    const input = { ...TYPED_DATA_JSON, primaryType: 'Missing' };

    expect(typedDataFromJson(input).primaryType).toBe('Missing');
  });

  describe('precision — integers beyond 2^53', () => {
    it.each([
      ['decimal string', '9007199254740993'],
      ['0x hex string', '0x20000000000001'],
    ])('keeps a %s integer field exact as bigint', (_label, amount) => {
      const input = { ...TYPED_DATA_JSON, message: { ...TYPED_DATA_JSON.message, amount } };

      expect((typedDataFromJson(input).message as { amount: bigint }).amount).toBe(9007199254740993n);
    });

    it('keeps the uint256 maximum exact when given as a decimal string', () => {
      const input = { ...TYPED_DATA_JSON, message: { ...TYPED_DATA_JSON.message, amount: UINT256_MAX.toString(10) } };

      expect((typedDataFromJson(input).message as { amount: bigint }).amount).toBe(UINT256_MAX);
    });

    it('accepts a JSON number up to Number.MAX_SAFE_INTEGER', () => {
      const input = { ...TYPED_DATA_JSON, message: { ...TYPED_DATA_JSON.message, amount: Number.MAX_SAFE_INTEGER } };

      expect((typedDataFromJson(input).message as { amount: bigint }).amount).toBe(9007199254740991n);
    });

    it.each([
      ['2^53', 2 ** 53],
      ['2^53 + 1 (already rounded by JSON)', 2 ** 53 + 1],
      ['a huge float', 1e21],
    ])('rejects an unsafe JSON number (%s) and points at decimal/hex strings', (_label, amount) => {
      const input = { ...TYPED_DATA_JSON, message: { ...TYPED_DATA_JSON.message, amount } };

      expect(() => typedDataFromJson(input)).toThrow(/message\.amount.*safe integer.*string/);
    });

    it('rejects a fractional number in an integer field', () => {
      const input = { ...TYPED_DATA_JSON, message: { ...TYPED_DATA_JSON.message, nonce: 1.5 } };

      expect(() => typedDataFromJson(input)).toThrow(/message\.nonce/);
    });

    it('keeps signed values for int types and converts nested structs and arrays of structs', () => {
      const input = {
        domain: { name: 'x', version: '1' },
        types: {
          Item: [
            { name: 'sku', type: 'string' },
            { name: 'qty', type: 'uint256' },
            { name: 'delta', type: 'int64' },
          ],
          Order: [
            { name: 'items', type: 'Item[]' },
            { name: 'total', type: 'uint256' },
            { name: 'adjustments', type: 'int256[]' },
          ],
        },
        primaryType: 'Order',
        message: {
          items: [
            { sku: 'A', qty: '9007199254740993', delta: -7 },
            { sku: 'B', qty: 2, delta: '-9007199254740993' },
          ],
          total: '0x20000000000001',
          adjustments: ['-1', 0, '0x10'],
        },
      };

      expect(typedDataFromJson(input).message).toEqual({
        items: [
          { sku: 'A', qty: 9007199254740993n, delta: -7n },
          { sku: 'B', qty: 2n, delta: -9007199254740993n },
        ],
        total: 9007199254740993n,
        adjustments: [-1n, 0n, 16n],
      });
    });
  });

  describe('domain.chainId', () => {
    it.each([
      ['decimal string', '137', 137n],
      ['0x hex string', '0x89', 137n],
      ['safe number', 137, 137n],
      ['decimal string beyond 2^53', '9007199254740993', 9007199254740993n],
      ['0x hex string beyond 2^53', '0x20000000000001', 9007199254740993n],
      ['uint256 maximum as a decimal string', UINT256_MAX.toString(10), UINT256_MAX],
      ['zero', 0, 0n],
    ])('normalises %s to an exact bigint', (_label, chainId, expected) => {
      const input = { ...TYPED_DATA_JSON, domain: { ...TYPED_DATA_JSON.domain, chainId } };

      expect((typedDataFromJson(input).domain as { chainId: bigint }).chainId).toBe(expected);
    });

    it('keeps a domain without chainId untouched (chainId is optional)', () => {
      const { chainId: _dropped, ...domain } = TYPED_DATA_JSON.domain;
      const input = { ...TYPED_DATA_JSON, domain };

      expect(typedDataFromJson(input).domain).toEqual(domain);
      expect('chainId' in (typedDataFromJson(input).domain as object)).toBe(false);
    });

    it.each([
      ['true', true],
      ['null', null],
      ['an object', {}],
      ['an array', []],
      ['a non-numeric string', 'polygon'],
      ['a fractional number', 1.5],
      ['a negative number', -1],
      ['a negative string', '-1'],
      ['an unsafe number (2^53)', 9007199254740992],
      ['uint256 maximum + 1', (UINT256_MAX + 1n).toString(10)],
      ['an empty string', ''],
    ])('rejects %s with an error naming domain.chainId', (_label, chainId) => {
      const input = { ...TYPED_DATA_JSON, domain: { ...TYPED_DATA_JSON.domain, chainId } };

      expect(() => typedDataFromJson(input)).toThrow(/domain\.chainId/);
    });
  });
});
