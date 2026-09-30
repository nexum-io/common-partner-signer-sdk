# AGENTS.md — common-partner-signer

`@nexum-io/partner-signer` — thin Node.js SDK for a **partner backend** to sign EIP-712 typed data and messages with **its own** wallet.

## Ownership

Engineering (workspace-wide shared package). Not owned by SSO, not by Escrow, not by HandyMan — HandyMan is a consumer, not the owner. Linear project: [JS SDK Signer](https://linear.app/nexum-io/project/js-sdk-signer-88cf22f651e0).

## Purpose

- `createSigner({ privateKey })` → `getAddress` / `signTypedData` / `signMessage`. That is the whole v1 surface.
- The host application owns the key: it reads its own env and passes `privateKey` in. The SDK never reads `process.env`.
- Nexum never holds partner keys. This package only signs.

## Tech stack

TypeScript (ESM, `NodeNext`, strict), viem, vitest, Node ≥ 20. No bundler, no HTTP server, no CLI in the package itself.

## Important directories

| Path | Contents |
|------|----------|
| `src/index.ts` | The only public entry (`exports["."]`) |
| `tests/` | vitest suites (`*.test.ts`) — type-level contract checks and the example smoke live here too |
| `examples/basic/` | Reference consumer (own `package.json`, SDK linked via `file:../..`); reads env itself; installed by `npm run setup` |
| `mcp/` | MCP stdio server for agents (own `package.json`, SDK linked via `file:..`): tools `signer_get_address` / `signer_sign_typed_data` / `signer_sign_message`; key from the MCP host process env; installed by `npm run setup`, checked by the root `ci:check` |
| `dist/` | Build output (`tsc -p tsconfig.build.json`), git-ignored |
| `.github/workflows/ci.yml` | `npm run setup` + `npm run ci:check` on Node 20 and 22, on every PR (stacked ones included) |

## Common commands

```bash
npm run setup        # root npm ci (prepare builds dist/) + examples/basic npm ci + mcp npm ci + mcp build; run this from the root BEFORE any npm command inside examples/basic or mcp (their file: links run the SDK prepare → need root devDependencies)
npm run ci:check     # SDK typecheck + build + test (incl. the example smoke), then mcp typecheck + build + test (incl. stdio through the launcher) — the real verify command
npm run test         # vitest run
npm run build        # emit dist/
```

## Implementation rules

- Do not widen the surface: no extra methods on `PartnerSigner`, no options beyond `privateKey`.
- Never read `process.env` inside the package. Never log the private key. Never put it into an `Error` (message, cause, serialised fields).
- No product HTTP calls, no ForwardRequest helper, no mnemonic / HD derivation, no KMS or remote signer, no WalletConnect.
- No product names in code or types (no Escrow / HandyMan / SSO specifics) — the SDK is product-agnostic.
- Keep viem as the only runtime dependency of the SDK. MCP-only dependencies (`@modelcontextprotocol/sdk`, `zod`) live in `mcp/package.json`, never in the root.
- The MCP reads `PARTNER_SIGNER_PRIVATE_KEY` from its own process env and passes it to `createSigner`; tool namespace is `signer_*` (never `wallet_*` — that is `common-wc-sign-tester`); no key in tool results, `mcp.json` examples, or logs; never `console.log` in the stdio server (stdout is the protocol).
- Relative imports use explicit `.js` extensions (NodeNext ESM).

## Testing rules

- Every behaviour change ships with a vitest test under `tests/`.
- Signing changes must prove `recover(address) === getAddress()` on fixtures (M1) and that the key is absent from logs and serialised errors.
- `npm run ci:check` must be green before a PR; CI runs it on Node 20 and 22.

## Release

Consumers install by git tag: `npm i github:nexum-io/common-partner-signer#vX.Y.Z` (npm runs `prepare` → `dist/`). To cut a version, on the merged `develop` commit:

```bash
# 1. version in package.json AND mcp/package.json (the MCP reports its own version) + CHANGELOG.md entry land through a normal PR;
#    re-run `npm run setup` so the example/mcp lockfiles pick up the new link version
# 2. tag the merge commit and push the tag
git tag -a v0.1.0 -m "v0.1.0" <develop-merge-commit>
git push origin v0.1.0
# 3. smoke: npm i github:nexum-io/common-partner-signer#v0.1.0 in an empty Node project
```

Never move a published tag; publish a new version instead.

## Safety notes

- Never commit real keys; `.env*` is git-ignored, examples must hold placeholders only.
- The repository is public — no internal infrastructure hosts/URLs, tokens, or partner identifiers in code, tests, or docs. Links to the Linear project are fine.

## Read next

| Topic | Doc |
|-------|-----|
| Contract v1 for partners | [README.md](README.md) |

## Agent delivery

- **SDD** is forbidden in this repo (no `.ai-sdd/`, no `.superpowers/sdd/`, no design specs or plans). This product has no docs hub. Ask the user where to file the SDD before writing it. API, ENV, and OpenAPI contracts for this service stay here.
- **Large work** is a Linear epic of tasks. One merge request is one task. Do not start implementation without a Linear issue unless the user explicitly says to proceed without one.
- **MR size** stays within 400–800 changed lines (lockfiles and generated artifacts excluded). Split near 400 lines. Above 800, explain in the handoff why the code is that large and why it was not split. Not a CI gate.
- **Reuse** a solution that already works in this repo or in `common/`. If the same logic appears more than once, ask the user before copying it and extract a shared component.
- **Security and quality** stay in the change (auth, money, signing, secrets, validation). Run this repo’s verify command.
- **Committees:** when the diff touches an important area, recommend the matching review before merge. Do not run it unless the user asks.
  - ownership, contracts, trust, money or chain boundaries → `/nexum-architecture-committee`
  - processors, queues, chain execution, KMS → `/nexum-processing-review`
  - schema, migrations, repositories → `/nexum-data-repository-committee`
  - CI, pipeline secrets, release gates → `/nexum-devsecops-committee`
