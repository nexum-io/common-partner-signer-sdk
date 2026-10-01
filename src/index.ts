/**
 * @nexum-io/partner-signer-sdk — public entry.
 *
 * v1 contract (locked): `createSigner({ privateKey })` → `getAddress` / `signTypedData` / `signMessage`.
 * The SDK never reads `process.env` and never puts the private key into logs or errors.
 */
export { createSigner } from './create-signer.js';
export { InvalidPrivateKeyError } from './errors.js';
export type { CreateSignerOptions, PartnerSigner } from './types.js';
