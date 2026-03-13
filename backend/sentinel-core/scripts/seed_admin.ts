/**
 * scripts/seed_admin.ts
 * Creates a ready-to-use ORG_ADMIN account for local development/demo.
 *
 * Run: node --import tsx scripts/seed_admin.ts
 */
import { db } from '../src/lib/database.js';
import { AuthService } from '../src/services/auth.service.js';
import { OrgService } from '../src/services/org.service.js';
import dotenv from 'dotenv';
dotenv.config();

const DEMO = {
    orgName: 'Demo Corp',
    orgSlug: 'demo-corp',
    email: 'admin@sentinel.local',
    password: 'Sentinel@2026!',
    fullName: 'Sentinel Admin',
};

async function seed() {
    console.log('🌱 Seeding demo admin account...\n');

    // Org
    let orgId: string;
    const existing = await db.query(`SELECT id FROM organizations WHERE slug = $1`, [DEMO.orgSlug]);
    if ((existing.rowCount ?? 0) > 0) {
        orgId = existing.rows[0].id;
        console.log(`   Org already exists → ${orgId}`);
    } else {
        const { organization } = await OrgService.createOrganization(DEMO.orgName, DEMO.orgSlug);
        orgId = organization.id;
        console.log(`   Created org        → ${orgId}`);
    }

    // User
    const existingUser = await AuthService.findUserByEmail(DEMO.email);
    if (existingUser) {
        // Update role to org_admin in case it was set to something else
        await db.query(`UPDATE users SET role = 'org_admin' WHERE email = $1`, [DEMO.email]);
        console.log(`   User already exists → updated role to org_admin`);
    } else {
        const passwordHash = await AuthService.hashPassword(DEMO.password);
        await db.query(
            `INSERT INTO users (organization_id, email, password_hash, role, full_name, is_active)
             VALUES ($1, $2, $3, 'org_admin', $4, true)`,
            [orgId, DEMO.email, passwordHash, DEMO.fullName]
        );
        console.log(`   Created user       → ${DEMO.email}`);
    }

    console.log('\n✅ Done! Login credentials:');
    console.log(`   URL:      http://localhost:3002`);
    console.log(`   Email:    ${DEMO.email}`);
    console.log(`   Password: ${DEMO.password}`);
    console.log(`   Role:     ORG_ADMIN\n`);

    process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
