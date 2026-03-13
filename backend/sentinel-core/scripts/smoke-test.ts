import crypto from 'crypto';

/**
 * Smoke Test Helper
 * This script demonstrates how to generate a signature for an event
 */

function signPayload(payload: any, privateKey: string) {
    const signer = crypto.createSign('SHA256');
    signer.update(JSON.stringify(payload));
    signer.end();
    return signer.sign(privateKey, 'hex');
}

// Example usage information for the user
console.log('--- Sentinel Core Event Signing Helper ---');
console.log('1. Generate RSA key pair (Agent-side)');
console.log('2. Provide Public Key during /devices/register');
console.log('3. Use Private Key to sign payload and send to /events/ingest');
console.log('-------------------------------------------');

const examplePayload = { event: 'test', data: 'hello sentinel' };
console.log('Example Payload:', examplePayload);
// Note: Actual signing needs a valid RSA private key
