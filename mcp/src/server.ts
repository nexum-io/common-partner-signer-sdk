import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PartnerSigner } from '@nexum-io/partner-signer-sdk';
import type { Hex } from 'viem';
import { z } from 'zod';

import { typedDataFromJson } from './typed-data-json.js';

export interface PartnerSignerMcpOptions {
  /**
   * Resolves the signer on demand. Throwing here (missing or invalid host key) surfaces as a
   * tool error with the thrown message, so the server can start even before the env is right.
   */
  readonly getSigner: () => PartnerSigner;
}

type ToolOutput = Record<string, string>;

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const hexBytes = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'expected 0x-prefixed hex bytes');

const typedDataInput = {
  domain: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'EIP-712 domain: name, version, chainId, verifyingContract, salt (all optional). chainId, when present, must be a non-negative uint256: decimal string, 0x hex string or safe number',
    ),
  types: z
    .record(z.string(), z.array(z.object({ name: z.string(), type: z.string() })))
    .describe('EIP-712 type definitions, e.g. { Order: [{ name: "amount", type: "uint256" }] }'),
  primaryType: z.string().describe('Name of the struct in `types` that `message` instantiates'),
  message: z
    .record(z.string(), z.unknown())
    .describe(
      'The struct to sign. Integer fields may be decimal strings, 0x hex strings or safe numbers (|n| <= 2^53-1); larger integers must be strings',
    ),
};

const signatureOutput = {
  address: z.string().describe('Signer address (EOA)'),
  signature: z.string().describe('65-byte signature, 0x hex'),
};

/**
 * MCP server exposing the v1 surface of @nexum-io/partner-signer-sdk 1:1 as tools.
 * Namespace `signer_*` — deliberately disjoint from common-wc-sign-tester's `wallet_*`.
 * Key material never enters tool results; the key stays inside the signer's closure.
 */
export function createPartnerSignerMcpServer({ getSigner }: PartnerSignerMcpOptions): McpServer {
  const server = new McpServer({ name: 'partner-signer', version });

  server.registerTool(
    'signer_get_address',
    {
      description: 'Address of the partner operational wallet (local EOA from the MCP host environment).',
      inputSchema: {},
      outputSchema: { address: z.string() },
    },
    () => toToolResult(() => ({ address: getSigner().getAddress() })),
  );

  server.registerTool(
    'signer_sign_typed_data',
    {
      description:
        'Sign EIP-712 typed data with the partner wallet. Pass domain, types, primaryType and message as JSON; integers beyond 2^53-1 must be decimal or 0x hex strings (JSON numbers lose precision).',
      inputSchema: typedDataInput,
      outputSchema: signatureOutput,
    },
    (input) =>
      toToolResult(async () => {
        const signer = getSigner();
        const signature = await signer.signTypedData(typedDataFromJson(input));
        return { address: signer.getAddress(), signature };
      }),
  );

  server.registerTool(
    'signer_sign_message',
    {
      description:
        'Sign a message with the partner wallet (EIP-191 personal_sign). Provide exactly one of `message` (UTF-8 string) or `raw` (0x hex bytes).',
      inputSchema: {
        message: z.string().optional().describe('UTF-8 message to sign'),
        raw: hexBytes.optional().describe('Raw bytes to sign, 0x hex'),
      },
      outputSchema: signatureOutput,
    },
    ({ message, raw }) =>
      toToolResult(async () => {
        if ((message === undefined) === (raw === undefined)) {
          throw new Error('provide exactly one of "message" (UTF-8 string) or "raw" (0x hex bytes)');
        }
        const signer = getSigner();
        const signature = await signer.signMessage(raw !== undefined ? { raw: raw as Hex } : (message as string));
        return { address: signer.getAddress(), signature };
      }),
  );

  return server;
}

/** Wrap a producer into an MCP tool result: JSON text + structuredContent, or `isError` with a value-free message. */
async function toToolResult(produce: () => ToolOutput | Promise<ToolOutput>): Promise<CallToolResult> {
  try {
    const output = await produce();
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: describeError(error) }] };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown error';
}
