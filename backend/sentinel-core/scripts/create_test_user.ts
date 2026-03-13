import { OrgService } from '../src/services/org.service.js';
import { AuthService } from '../src/services/auth.service.js';
import { db } from '../src/lib/database.js';

async function execute() {
    console.log('Creating test org and user...');

    // 1. Create Org
    let org = null;
    const existingOrgResult = await db.query(`SELECT id FROM organizations WHERE slug = 'test-org'`);
    if (existingOrgResult.rowCount > 0) {
        org = { id: existingOrgResult.rows[0].id };
        console.log('Org already exists:', org.id);
    } else {
        const result = await OrgService.createOrganization('Test Org', 'test-org');
        org = result.organization;
        console.log('Created Org:', org.id);
    }

    // 2. Create User
    const existingUser = await AuthService.findUserByEmail('attacker@test.com');
    if (existingUser) {
        console.log('User already exists:', existingUser.id);
    } else {
        const passwordHash = await AuthService.hashPassword('wrong-password');
        await db.query(
            `INSERT INTO users (organization_id, email, password_hash, role)
             VALUES ($1, $2, $3, 'user')`,
            [org.id, 'attacker@test.com', passwordHash]
        );
        console.log('Created User: attacker@test.com');
    }

    process.exit(0);
}

execute().catch(console.error);
