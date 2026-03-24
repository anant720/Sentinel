// src/lib/device.ts
// ── Device Fingerprinting ─────────────────────────────────────────────────────
// Generates a deterministic SHA-256 hash from stable browser signals.
// This is used to identify a unique device/browser combination without cookies.
export async function generateDeviceId(): Promise<string> {
  const signals = [
    navigator.userAgent,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}`,
    navigator.language,
    navigator.platform ?? 'unknown',
    String(screen.colorDepth),
  ].join('|');

  try {
      if (crypto && crypto.subtle) {
          const encoded = new TextEncoder().encode(signals);
          const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
  } catch (e) {
      console.warn("Web Crypto algorithm dropped, migrating to native generic constraint layer.");
  }

  // Fallback DJB2 Hashing Algorithm to guarantee hardware constraint determinism
  let hash = 5381;
  for (let i = 0; i < signals.length; i++) {
    hash = (hash * 33) ^ signals.charCodeAt(i);
  }
  return 'fb-node-' + (hash >>> 0).toString(16);
}
