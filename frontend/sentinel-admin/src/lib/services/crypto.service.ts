/**
 * crypto.service.ts — Client-side cryptographic primitives.
 * Uses Web Crypto API for secure, hardware-accelerated operations.
 */

export class CryptoService {
  /**
   * Derives a Master Key from a password and salt using PBKDF2.
   * This key never leaves the client and is used for payload encryption.
   */
  static async deriveMasterKey(password: string, email: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Use email as salt (simple approach for this project, should be unique salt in prod)
    const salt = encoder.encode(email.toLowerCase());

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true, // extractable for session storage if needed, but better to keep false
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Hashes a password for authentication.
   * This is sent to the server instead of the raw password.
   */
  static async hashPasswordForAuth(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Encrypts a payload using AES-GCM and the derived Master Key.
   */
  static async encryptPayload(payload: any, masterKey: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      encoder.encode(JSON.stringify(payload))
    );

    // Combine IV + ciphertext for storage
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypts a base64 ciphertext using AES-GCM and the Master Key.
   */
  static async decryptPayload(base64Ciphertext: string, masterKey: CryptoKey): Promise<any> {
    try {
      const combined = new Uint8Array(
        atob(base64Ciphertext)
          .split('')
          .map((c) => c.charCodeAt(0))
      );
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch (err) {
      console.error('Decryption failed:', err);
      return null;
    }
  }
}
