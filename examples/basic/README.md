# examples/basic — env outside, `createSigner` inside

The smallest honest consumer of `@nexum-io/partner-signer-sdk`:

1. the **application** reads `PARTNER_SIGNER_PRIVATE_KEY` from its environment (the name is yours to choose);
2. passes it to `createSigner` — the SDK never reads `process.env`;
3. prints the address, signs an EIP-712 payload and a message, and verifies both with viem's `recover*` helpers.

From a fresh clone, run the root setup first: the `file:../..` link runs the SDK's `prepare` (tsc), which needs the root devDependencies, so a bare `npm ci` inside this folder fails with `tsc: command not found`.

```bash
npm run setup                 # from the repository root: installs the SDK (+ builds dist/) and this example
cd examples/basic
cp .env.example .env          # put your key into .env — it is git-ignored
npm start                     # node --env-file=.env main.mjs
```

Expected output (address depends on your key):

```text
address: 0x…
typed data signature: 0x…
typed data recover: OK
message signature: 0x…
message recover: OK
```

Exit code is `1` when the variable is missing, the key is malformed (`InvalidPrivateKeyError`, no key material echoed) or a recover check fails.

Requires Node ≥ 20.6 (`--env-file`). In your own service use `github:nexum-io/common-partner-signer-sdk#vX` instead of the `file:` link — then a plain `npm install` is all you need.
