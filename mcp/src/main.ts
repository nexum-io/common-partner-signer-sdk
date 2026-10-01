// stdio entry: the MCP HOST process environment provides the key; the SDK itself never reads env.
// stdout is the protocol channel — never console.log here. Diagnostics, if any, go to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSigner, type PartnerSigner } from '@nexum-io/partner-signer-sdk';
import type { Hex } from 'viem';

import { createPartnerSignerMcpServer } from './server.js';

const ENV_VAR = 'PARTNER_SIGNER_PRIVATE_KEY';

let cached: PartnerSigner | undefined;

function getSigner(): PartnerSigner {
  if (cached) return cached;
  const privateKey = process.env[ENV_VAR];
  if (!privateKey) {
    throw new Error(
      `${ENV_VAR} is not set in the MCP host process environment. Export it in the shell that starts the MCP client, or use bin/partner-signer-mcp.sh with a git-ignored mcp/.env — never put the key into mcp.json.`,
    );
  }
  cached = createSigner({ privateKey: privateKey as Hex });
  return cached;
}

const server = createPartnerSignerMcpServer({ getSigner });
await server.connect(new StdioServerTransport());
