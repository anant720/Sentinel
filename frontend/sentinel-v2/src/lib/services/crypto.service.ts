export class CryptoService {
  static async deriveMasterKey(password: string, email: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']
    );
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode(email.toLowerCase()), iterations: 100000, hash: 'SHA-256' },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  static async hashPasswordForAuth(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(password));
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async encryptPayload(payload: any, masterKey: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, masterKey, encoder.encode(JSON.stringify(payload))
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  static async decryptPayload(base64Ciphertext: string, masterKey: CryptoKey): Promise<any> {
    try {
      const combined = new Uint8Array(atob(base64Ciphertext).split('').map(c => c.charCodeAt(0)));
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: combined.slice(0, 12) }, masterKey, combined.slice(12)
      );
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch { return null; }
  }
}
