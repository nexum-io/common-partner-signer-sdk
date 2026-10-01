# @nexum-io/partner-signer-sdk

Thin Node.js SDK for a **partner backend** that needs to sign EIP-712 typed data and EIP-191 messages with **its own wallet** — one operational EOA held by the partner. Nexum never sees, stores, or custodies the key: this package only signs what your service asks it to sign.

**Status:** v1 — contract locked (this README is its source of truth), `createSigner` implemented on viem local accounts, recover-tested on Node 20 and 22.

## What it is — and is not

| It is | It is not |
|-------|-----------|
| `createSigner({ privateKey })` → `getAddress` / `signTypedData` / `signMessage` | An HTTP client for any Nexum product API |
| A wrapper over [viem](https://viem.sh) local accounts, TypeScript ESM, Node ≥ 20 | A ForwardRequest / meta-transaction builder |
| Key handling on **your** side: you read the env, you pass the key in | Mnemonic / HD derivation, KMS, WalletConnect, or a human wallet |
| Zero logging of key material, ever | Key custody by Nexum |

Your service prepares the payload (typed data or message); the signer only produces the signature.

## Contract v1 — locks

1. `createSigner({ privateKey })` — the SDK **never reads `process.env`**. The environment stays outside the package.
2. Surface is exactly three methods: `getAddress()`, `signTypedData(typedData)`, `signMessage(message)`.
3. Stack: viem, TypeScript ESM, Node ≥ 20.
4. The private key is **never logged** and **never placed into an `Error`** (message, cause, or serialised fields).
5. Out of scope: mnemonic / HD derivation, product HTTP APIs, ForwardRequest helpers, KMS or remote signers, WalletConnect.

## Install

Node ≥ 20, ESM only (`import`, no `require`).

```bash
npm install github:nexum-io/common-partner-signer-sdk#v0.2.0
```

Pin a tag (`#vX.Y.Z`), never a branch, in production. Tags are listed at https://github.com/nexum-io/common-partner-signer-sdk/tags; changes per version are in [CHANGELOG.md](CHANGELOG.md). npm builds `dist/` on install (the `prepare` script), so no registry publication is needed.

## Migration from `@nexum-io/partner-signer`

```bash
npm uninstall @nexum-io/partner-signer
npm install github:nexum-io/common-partner-signer-sdk#v0.2.0
```

```ts
import { createSigner } from '@nexum-io/partner-signer-sdk';
```

No other API changes — `createSigner` and the three methods are unchanged.

## Quick start

Your application owns the key: read it from your secret store or environment (any variable name you like) and pass it to `createSigner`.

```ts
import { createSigner } from '@nexum-io/partner-signer-sdk';

// Your app reads its own env — the SDK does not.
const privateKey = process.env.PARTNER_SIGNER_PRIVATE_KEY as `0x${string}`;

const signer = createSigner({ privateKey });

const address = signer.getAddress();
// '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const signature = await signer.signTypedData({
  domain: { name: 'Example', version: '1', chainId: 137 },
  types: { Ping: [{ name: 'nonce', type: 'uint256' }] },
  primaryType: 'Ping',
  message: { nonce: 1n },
});
// '0x…' — 65-byte EIP-712 signature

const messageSignature = await signer.signMessage('hello');
// '0x…' — EIP-191 personal_sign signature
```

## API

### `createSigner(options): PartnerSigner`

| Option | Type | Notes |
|--------|------|-------|
| `privateKey` | `` `0x${string}` `` | 32-byte hex, `0x` + 64 hex characters. Anything else (wrong length, non-hex, not a valid secp256k1 scalar, not a string) throws `InvalidPrivateKeyError` — the error never contains the value and has no `cause`. |

Returns a `PartnerSigner`. The address is derived once, at creation. `InvalidPrivateKeyError` is exported for `instanceof` checks.

### `signer.getAddress(): Address`

Synchronous. Returns the checksummed EOA address that will sign.

### `signer.signTypedData(typedData): Promise<Hex>`

EIP-712. `typedData` is `{ domain, types, primaryType, message }` exactly as viem's `signTypedData` takes it (`TypedDataDefinition`); with `as const` typed data you get full type checking of `primaryType` and `message`. Returns the 65-byte signature as hex.

### `signer.signMessage(message): Promise<Hex>`

EIP-191 `personal_sign`. `message` is either a UTF-8 string or `{ raw: Hex | Uint8Array }` to sign raw bytes. Returns the 65-byte signature as hex.

### Verifying on your side

Recovery is not part of the SDK surface — use viem directly:

```ts
import { recoverTypedDataAddress, recoverMessageAddress } from 'viem';

const recovered = await recoverTypedDataAddress({ ...typedData, signature });
recovered === signer.getAddress(); // true

const recoveredFromMessage = await recoverMessageAddress({ message: 'hello', signature: messageSignature });
```

## Example

[`examples/basic`](examples/basic/README.md) is a runnable reference consumer: the app reads `PARTNER_SIGNER_PRIVATE_KEY` from its `.env`, passes it to `createSigner`, prints the address and verifies both signatures with viem's `recover*` helpers.

From a fresh clone, install from the **repository root** first — the example links the SDK via `file:../..`, and that link runs the SDK's `prepare` (tsc), which needs the root devDependencies:

```bash
npm run setup                          # repo root: installs the package (+ builds dist/) and the example
cd examples/basic
cp .env.example .env                   # then put your key into .env — it is git-ignored
npm start                              # node --env-file=.env main.mjs
```

## MCP for agents

[`mcp/`](mcp/README.md) is a stdio MCP server exposing the same three operations as tools (`signer_get_address`, `signer_sign_typed_data`, `signer_sign_message`). The MCP process reads `PARTNER_SIGNER_PRIVATE_KEY` from its own environment (or a git-ignored `mcp/.env` as a fallback) and passes it to `createSigner`; the key never goes into `mcp.json`. It is not WalletConnect and not a human wallet. Install and build from the repository root with `npm run setup`, then run `mcp/bin/partner-signer-mcp.sh`.

## Key handling

- Keep the key in your secret store; inject it into the process environment at runtime. Never commit `.env` files with real keys.
- One key per signer instance. To rotate, create a new signer with the new key.
- The signer object holds the key in a closure: `JSON.stringify(signer)`, `util.inspect(signer)` and error messages never expose it.
- The SDK does not log. Any diagnostics belong to your application, and they must not print the key either.

## Versioning

Semantic versioning through git tags (`vX.Y.Z`). Consume a tag, not a branch, in production. Breaking changes to the three-method surface mean a major version.

## Development

```bash
nvm use            # Node 22 for development; the package supports Node >= 20
npm run setup      # npm ci for the package (prepare builds dist/), examples/basic and mcp (SDK linked via file:), then builds mcp/dist
npm run ci:check   # SDK: typecheck + build + test (incl. the example smoke); then mcp: typecheck + build + test (incl. stdio through the launcher)
```

Run `npm run setup` from the repository root before any `npm` command inside `examples/basic` or `mcp`.

Contributor rules for agents and humans: [AGENTS.md](AGENTS.md).

## Links

- Linear project: https://linear.app/nexum-io/project/js-sdk-signer-88cf22f651e0
- viem local accounts: https://viem.sh/docs/accounts/local
