/**
 * src/lib/database.ts — Re-export shim for backward compatibility.
 * The actual DB client lives at src/db/client.ts.
 */
export { pool, db } from '../db/client.js';
