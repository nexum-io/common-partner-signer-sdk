// Reference consumer: the APPLICATION owns the key and reads its own environment.
// The SDK never touches process.env — it only receives `privateKey` and signs.
import { createSigner, InvalidPrivateKeyError } from '@nexum-io/partner-signer-sdk';
import { recoverMessageAddress, recoverTypedDataAddress } from 'viem';

// Any variable name you like — it is your application's contract, not the SDK's.
const privateKey = process.env.PARTNER_SIGNER_PRIVATE_KEY;

if (!privateKey) {
  console.error(
    'PARTNER_SIGNER_PRIVATE_KEY is not set. Copy .env.example to .env and put your key there (never commit .env).',
  );
  process.exit(1);
}

let signer;
try {
  signer = createSigner({ privateKey });
} catch (error) {
  // InvalidPrivateKeyError carries no key material, so its message is safe to print.
  // Anything else is reported generically — never echo the input.
  console.error(
    error instanceof InvalidPrivateKeyError ? `${error.name}: ${error.message}` : 'createSigner failed',
  );
  process.exit(1);
}

const address = signer.getAddress();
console.log(`address: ${address}`);

// The payload is prepared by your service; this is only a shape example.
const typedData = {
  domain: { name: 'Partner Signer Example', version: '1', chainId: 137 },
  types: {
    Order: [
      { name: 'orderId', type: 'string' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
  },
  primaryType: 'Order',
  message: { orderId: 'ORD-1', amount: 1_000_000n, nonce: 1n },
};

const typedDataSignature = await signer.signTypedData(typedData);
const recoveredFromTypedData = await recoverTypedDataAddress({ ...typedData, signature: typedDataSignature });
console.log(`typed data signature: ${typedDataSignature}`);
console.log(`typed data recover: ${recoveredFromTypedData === address ? 'OK' : 'MISMATCH'}`);

const message = 'partner-signer example';
const messageSignature = await signer.signMessage(message);
const recoveredFromMessage = await recoverMessageAddress({ message, signature: messageSignature });
console.log(`message signature: ${messageSignature}`);
console.log(`message recover: ${recoveredFromMessage === address ? 'OK' : 'MISMATCH'}`);

if (recoveredFromTypedData !== address || recoveredFromMessage !== address) {
  process.exit(1);
}
