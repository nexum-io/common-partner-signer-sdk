# partner-signer MCP (stdio)

MCP server for agents (Cursor, Claude Code, …) that exposes `@nexum-io/partner-signer-sdk` 1:1 as tools. It is a **local partner EOA from a private key** — not WalletConnect, not a human wallet, not `common-wc-sign-tester`.

| Tool | Input | Output |
|------|-------|--------|
| `signer_get_address` | — | `{ address }` |
| `signer_sign_typed_data` | `{ domain?, types, primaryType, message }` (EIP-712 as JSON; integer fields and `domain.chainId` may be decimal strings, `0x` hex strings or **safe** numbers ≤ 2^53−1 — larger integers must be strings, unsafe numbers are rejected; `chainId` is optional but, when present, must be a valid uint256) | `{ address, signature }` |
| `signer_sign_message` | exactly one of `{ message }` (UTF-8) or `{ raw }` (`0x` hex bytes) | `{ address, signature }` |

Errors come back as tool errors (`isError: true`) with a text hint. Key material never appears in results or logs: the key stays inside the signer's closure, stdout is the protocol channel, nothing is printed to stderr.

## Where the key comes from

The MCP **process** reads `PARTNER_SIGNER_PRIVATE_KEY` from its own environment and passes it to `createSigner`. The SDK never touches `process.env`. Precedence in `bin/partner-signer-mcp.sh`:

1. **Environment of the launcher** — the variable exported in the shell that starts the MCP client (e.g. the terminal you launch Cursor from) always wins.
2. **Dotenv fallback** — only when the variable is unset: `mcp/.env` (git-ignored; copy from `.env.example`) or the file named in `PARTNER_SIGNER_DOTENV_FILE`. The file is parsed line by line (`KEY=value`, optional quotes, CRLF tolerated) and is never executed as shell.

Never put the key into `mcp.json` (Cursor stores it in plain text next to the project).

## Run

From a fresh clone, install and build from the **repository root**: `mcp/` links the SDK via `file:..`, and that link runs the SDK's `prepare` (tsc), which needs the root devDependencies — a bare `npm ci` inside `mcp/` fails with `tsc: command not found`.

```bash
npm run setup                # repo root: installs the SDK (+ builds dist/), the example and mcp/, and builds mcp/dist
cp mcp/.env.example mcp/.env # fallback 2 above — or export the variable in the launching shell instead
mcp/bin/partner-signer-mcp.sh
```

After code changes in `mcp/src`, rebuild with `npm run build --prefix mcp` (or `npm run ci:check --prefix mcp`, which also runs the tests).

`npm run ci:check` = typecheck + build + tests (in-memory transport tests plus real stdio round trips through the launcher: env key, missing key, invalid key, dotenv fallback and precedence — hermetic, an existing `mcp/.env` does not affect them).

## Cursor

Copy [`mcp.json.example`](mcp.json.example) into your project's `.cursor/mcp.json` (git-ignored) and set the absolute path to `bin/partner-signer-mcp.sh`. Only `PATH` goes into `env`; the key comes from option 1 or 2 above.

```json
{
  "mcpServers": {
    "partner-signer": {
      "command": "/ABSOLUTE/PATH/TO/common-partner-signer-sdk/mcp/bin/partner-signer-mcp.sh",
      "args": [],
      "env": { "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" }
    }
  }
}
```

Smoke from the agent: `signer_get_address` → then `signer_sign_typed_data` with your payload → verify with viem `recoverTypedDataAddress` that the recovered address equals the one returned.

## Not `common-wc-sign-tester`

| | partner-signer MCP | wc-sign-tester MCP |
|---|---|---|
| Wallet | local EOA of the partner, key in the MCP host env | headless WalletConnect wallet paired to a SPA session |
| Tools | `signer_get_address`, `signer_sign_typed_data`, `signer_sign_message` | `wallet_*` (pairing, sessions, pending requests, transactions) |
| Sessions / pairing | none | WalletConnect relay |
| Transactions | none — signing only | `wallet_send_transaction` |
| Product HTTP | none | targets catalog of Nexum SPAs |

Tool namespaces are disjoint, so both servers can be enabled at once.
