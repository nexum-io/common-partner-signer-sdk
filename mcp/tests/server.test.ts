import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createSigner, type PartnerSigner } from '@nexum-io/partner-signer-sdk';
import { recoverMessageAddress, recoverTypedDataAddress } from 'viem';
import { afterEach, describe, expect, it } from 'vitest';

import { createPartnerSignerMcpServer } from '../src/server.js';
import { TEST_ADDRESS, TEST_PRIVATE_KEY, TYPED_DATA_JSON, TYPED_DATA_VIEM } from './fixtures.js';

type Signed = { address: string; signature: `0x${string}` };

const cleanups: Array<() => Promise<void>> = [];

async function connect(getSigner: () => PartnerSigner) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPartnerSignerMcpServer({ getSigner });
  const client = new Client({ name: 'partner-signer-mcp-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanups.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

function text(result: CallToolResult): string {
  return result.content.map((item) => (item.type === 'text' ? item.text : '')).join('\n');
}

const withKey = () => createSigner({ privateKey: TEST_PRIVATE_KEY });

describe('partner-signer MCP server', () => {
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it('exposes exactly three signer_* tools — a namespace disjoint from wc-sign-tester (wallet_*)', async () => {
    const client = await connect(withKey);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'signer_get_address',
      'signer_sign_message',
      'signer_sign_typed_data',
    ]);
    expect(tools.every((tool) => !tool.name.startsWith('wallet_'))).toBe(true);
  });

  it('signer_get_address returns the address of the key from the host environment', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_get_address', {});

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ address: TEST_ADDRESS });
    expect(text(result)).toContain(TEST_ADDRESS);
  });

  it('signer_sign_typed_data signs JSON typed data (integers as strings); recover equals the returned address', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_sign_typed_data', TYPED_DATA_JSON);

    expect(result.isError, text(result)).toBeFalsy();
    const { address, signature } = result.structuredContent as Signed;
    const recovered = await recoverTypedDataAddress({ ...TYPED_DATA_VIEM, signature });
    expect(recovered).toBe(address);
    expect(address).toBe(TEST_ADDRESS);
  });

  it('signer_sign_message signs a UTF-8 string; recover equals the returned address', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_sign_message', { message: 'hello from an agent' });

    expect(result.isError, text(result)).toBeFalsy();
    const { address, signature } = result.structuredContent as Signed;
    expect(await recoverMessageAddress({ message: 'hello from an agent', signature })).toBe(address);
    expect(address).toBe(TEST_ADDRESS);
  });

  it('signer_sign_message signs raw bytes when given { raw }', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_sign_message', { raw: '0x68656c6c6f' });

    expect(result.isError, text(result)).toBeFalsy();
    const { address, signature } = result.structuredContent as Signed;
    expect(await recoverMessageAddress({ message: { raw: '0x68656c6c6f' }, signature })).toBe(address);
  });

  it('signer_sign_message rejects a call with neither message nor raw as a tool error', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_sign_message', {});

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/message|raw/);
  });

  it('reports a malformed typed data payload as a tool error, not a crash', async () => {
    const client = await connect(withKey);

    const result = await call(client, 'signer_sign_typed_data', { ...TYPED_DATA_JSON, primaryType: 'Missing' });

    expect(result.isError).toBe(true);
    expect(text(result).length).toBeGreaterThan(0);
  });

  it('never returns key material in any tool result', async () => {
    const client = await connect(withKey);
    const needle = TEST_PRIVATE_KEY.slice(2).toLowerCase();

    const results = await Promise.all([
      call(client, 'signer_get_address', {}),
      call(client, 'signer_sign_typed_data', TYPED_DATA_JSON),
      call(client, 'signer_sign_message', { message: 'x' }),
      call(client, 'signer_sign_message', {}),
      call(client, 'signer_sign_typed_data', { ...TYPED_DATA_JSON, primaryType: 'Missing' }),
    ]);

    for (const result of results) {
      expect(JSON.stringify(result).toLowerCase()).not.toContain(needle);
    }
  });

  it('turns a missing host key into a tool error with a hint', async () => {
    const client = await connect(() => {
      throw new Error('PARTNER_SIGNER_PRIVATE_KEY is not set in the MCP host process environment');
    });

    const result = await call(client, 'signer_get_address', {});

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('PARTNER_SIGNER_PRIVATE_KEY');
  });

  it('turns an invalid host key into an InvalidPrivateKeyError tool error without echoing the value', async () => {
    const client = await connect(() => createSigner({ privateKey: '0xdeadbeef' }));

    const result = await call(client, 'signer_get_address', {});

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('InvalidPrivateKeyError');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('deadbeef');
  });

  describe('integer precision and chainId validation (regressions)', () => {
    // Independent reference: exact bigint literals, never produced by typedDataFromJson.
    const BIG = 9007199254740993n; // 2^53 + 1
    const UINT256_MAX = (1n << 256n) - 1n;
    const types = {
      Item: [
        { name: 'sku', type: 'string' },
        { name: 'qty', type: 'uint256' },
      ],
      Order: [
        { name: 'items', type: 'Item[]' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint64' },
      ],
    } as const;
    const referenceMessage = {
      items: [
        { sku: 'A', qty: BIG },
        { sku: 'B', qty: 2n },
      ],
      amount: BIG,
      nonce: BIG,
    };
    const jsonMessage = {
      items: [
        { sku: 'A', qty: '9007199254740993' },
        { sku: 'B', qty: 2 },
      ],
      amount: '9007199254740993',
      nonce: '0x20000000000001',
    };
    const domainBase = { name: 'Precision', version: '1' };

    async function signWithChainId(client: Client, chainId: unknown) {
      return call(client, 'signer_sign_typed_data', {
        domain: { ...domainBase, chainId },
        types,
        primaryType: 'Order',
        message: jsonMessage,
      });
    }

    it.each([
      ['decimal string', '9007199254740993'],
      ['0x hex string', '0x20000000000001'],
    ])('signs chainId %s beyond 2^53 exactly — recover matches only the exact chainId', async (_label, chainId) => {
      const client = await connect(withKey);

      const result = await signWithChainId(client, chainId);

      expect(result.isError, text(result)).toBeFalsy();
      const { address, signature } = result.structuredContent as Signed;
      const exact = await recoverTypedDataAddress({
        domain: { ...domainBase, chainId: BIG },
        types,
        primaryType: 'Order',
        message: referenceMessage,
        signature,
      });
      const rounded = await recoverTypedDataAddress({
        domain: { ...domainBase, chainId: 9007199254740992n },
        types,
        primaryType: 'Order',
        message: referenceMessage,
        signature,
      });
      expect(exact).toBe(address);
      expect(rounded).not.toBe(address);
    });

    it('signs a domain without chainId (chainId stays optional)', async () => {
      const client = await connect(withKey);

      const result = await call(client, 'signer_sign_typed_data', {
        domain: domainBase,
        types,
        primaryType: 'Order',
        message: jsonMessage,
      });

      expect(result.isError, text(result)).toBeFalsy();
      const { address, signature } = result.structuredContent as Signed;
      const recovered = await recoverTypedDataAddress({
        domain: domainBase,
        types,
        primaryType: 'Order',
        message: referenceMessage,
        signature,
      });
      expect(recovered).toBe(address);
    });

    it('rejects an unsafe JSON number in an integer field with isError and no signature, then keeps serving', async () => {
      const client = await connect(withKey);

      const rejected = await call(client, 'signer_sign_typed_data', {
        domain: { ...domainBase, chainId: 137 },
        types,
        primaryType: 'Order',
        message: { ...jsonMessage, amount: 9007199254740993 },
      });

      expect(rejected.isError).toBe(true);
      expect(rejected.structuredContent).toBeUndefined();
      expect(text(rejected)).toMatch(/message\.amount/);
      expect(text(rejected)).not.toContain('signature');

      const next = await signWithChainId(client, 137);
      expect(next.isError, text(next)).toBeFalsy();
      expect((next.structuredContent as Signed).signature).toMatch(/^0x[0-9a-f]{130}$/);
    });

    it.each([
      ['true', true],
      ['null', null],
      ['an object', {}],
      ['an array', []],
      ['a non-numeric string', 'polygon'],
      ['a fractional number', 1.5],
      ['a negative number', -1],
      ['an unsafe number (2^53)', 9007199254740992],
      ['uint256 maximum + 1', (UINT256_MAX + 1n).toString(10)],
    ])('rejects chainId %s with isError, no signature and no key material, then keeps serving', async (_label, chainId) => {
      const client = await connect(withKey);

      const rejected = await signWithChainId(client, chainId);

      expect(rejected.isError).toBe(true);
      expect(rejected.structuredContent).toBeUndefined();
      expect(text(rejected)).toMatch(/domain\.chainId/);
      expect(JSON.stringify(rejected).toLowerCase()).not.toContain(TEST_PRIVATE_KEY.slice(2).toLowerCase());

      const next = await signWithChainId(client, '137');
      expect(next.isError, text(next)).toBeFalsy();
    });

    it('keeps the uint256 maximum exact in a message field and rejects maximum + 1', async () => {
      const client = await connect(withKey);
      const max = UINT256_MAX.toString(10);

      const ok = await call(client, 'signer_sign_typed_data', {
        domain: { ...domainBase, chainId: '137' },
        types,
        primaryType: 'Order',
        message: { ...jsonMessage, amount: max },
      });
      expect(ok.isError, text(ok)).toBeFalsy();
      const { address, signature } = ok.structuredContent as Signed;
      const recovered = await recoverTypedDataAddress({
        domain: { ...domainBase, chainId: 137n },
        types,
        primaryType: 'Order',
        message: { ...referenceMessage, amount: UINT256_MAX },
        signature,
      });
      expect(recovered).toBe(address);

      const tooBig = await call(client, 'signer_sign_typed_data', {
        domain: { ...domainBase, chainId: '137' },
        types,
        primaryType: 'Order',
        message: { ...jsonMessage, amount: (UINT256_MAX + 1n).toString(10) },
      });
      expect(tooBig.isError).toBe(true);
      expect(tooBig.structuredContent).toBeUndefined();
    });
  });
});
