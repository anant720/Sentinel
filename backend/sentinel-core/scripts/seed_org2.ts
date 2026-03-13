/**
 * scripts/seed_org2.ts
 * Creates a second demo organization + ORG_ADMIN user.
 */
import { pool } from '../src/db/client.js';
import bcrypt from 'bcrypt';

const ORG_NAME = 'Acme Security Inc.';
const ORG_SLUG = 'acme-security';
const ADMIN_EMAIL = 'admin@acme.local';
const ADMIN_PASSWORD = 'Acme@2026!';
const SALT_ROUNDS = 12;

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create org (api_key_hash is a legacy NOT NULL col — use placeholder)
        const { createHash } = await import('crypto');
        const placeholderHash = createHash('sha256').update(ORG_SLUG + Date.now()).digest('hex');

        const orgRes = await client.query(
            `INSERT INTO organizations (name, slug, api_key_hash)
             VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id, name, slug`,
            [ORG_NAME, ORG_SLUG, placeholderHash]
        );
        const org = orgRes.rows[0];
        console.log(`✅ Organization: "${org.name}" (${org.id})`);

        // 2. Hash password
        const hash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

        // 3. Create admin user
        const userRes = await client.query(
            `INSERT INTO users (organization_id, email, password_hash, role, is_active)
             VALUES ($1, $2, $3, 'org_admin', true)
             ON CONFLICT (email) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    organization_id = EXCLUDED.organization_id,
                    role = EXCLUDED.role,
                    is_active = true
             RETURNING id, email, role`,
            [org.id, ADMIN_EMAIL, hash]
        );
        const user = userRes.rows[0];
        console.log(`✅ Admin user: ${user.email} (role: ${user.role})`);

        await client.query('COMMIT');

        console.log('\n─────────────────────────────────────');
        console.log('  Second org seeded successfully!');
        console.log('─────────────────────────────────────');
        console.log(`  Organization : ${org.name}`);
        console.log(`  Org ID       : ${org.id}`);
        console.log(`  Email        : ${ADMIN_EMAIL}`);
        console.log(`  Password     : ${ADMIN_PASSWORD}`);
        console.log('─────────────────────────────────────\n');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });
