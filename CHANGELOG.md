# Changelog

All notable changes to `@nexum-io/partner-signer-sdk`. Versions are git tags (`vX.Y.Z`); consume by tag.

## 0.2.0

Breaking identity rename only — signing contract v1 unchanged.

- npm package: `@nexum-io/partner-signer` → `@nexum-io/partner-signer-sdk`
- GitHub repo: `nexum-io/common-partner-signer` → `nexum-io/common-partner-signer-sdk`
- Install: `npm install github:nexum-io/common-partner-signer-sdk#v0.2.0`
- No API changes to `createSigner` / MCP `signer_*` tools

## 0.1.0

First public release of the v1 contract (published under `@nexum-io/partner-signer` / `common-partner-signer`).

- `createSigner({ privateKey })` over viem local accounts — `getAddress()`, `signTypedData(typedData)`, `signMessage(message)`.
- `InvalidPrivateKeyError` for malformed keys; the error never carries the value and has no `cause`.
- The SDK never reads `process.env`; the key stays in a closure and never reaches logs, errors or serialisations (covered by tests).
- Type surface: `CreateSignerOptions`, `PartnerSigner` (viem `TypedDataDefinition` / `SignableMessage` types).
- Reference consumer `examples/basic` and the `mcp/` stdio server for agents (`signer_get_address`, `signer_sign_typed_data`, `signer_sign_message`) — both outside the package's runtime dependencies.
- Node ≥ 20, TypeScript ESM, CI on Node 20 and 22.
- MIT license (`LICENSE` in the package).
