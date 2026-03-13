import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { pool } from '../src/db/client.js';

test('Database Production Hardening: Automated pg_dump Backup & Restore', async (t) => {
    const CONTAINER_NAME = 'sentinel-core-postgres-1';
    const TEST_DB = 'sentinel_restore_test';
    const PROD_DB = 'sentinel_core';
    const DUMP_PATH = '/tmp/nightly_backup.sql';

    await t.test('Successfully executes a native pg_dump on the live PostgreSQL container', () => {
        try {
            // Drop the old dump if it exists
            execSync(`docker exec ${CONTAINER_NAME} rm -f ${DUMP_PATH}`);
            // Run pg_dump
            execSync(`docker exec ${CONTAINER_NAME} pg_dump -U postgres -d ${PROD_DB} -F c -f ${DUMP_PATH}`);

            // Check file exists
            const out = execSync(`docker exec ${CONTAINER_NAME} ls -lh ${DUMP_PATH}`).toString();
            assert.ok(out.includes('nightly_backup.sql'), 'Dump file must physically exist inside the logical container volume bounds.');
        } catch (e: any) {
            console.error('Backup Dump Error:', e.stdout?.toString() || e.message);
            assert.fail('Docker Exec Drop Failed');
        }
    });

    await t.test('Idempotently Restores the binary backup squarely into a fresh DB Schema validating migration safety', async () => {
        try {
            // Disconnect standard pool safely to mutate DBs
            await pool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
            await pool.query(`CREATE DATABASE ${TEST_DB}`);

            // Use pg_restore inside docker to push the binary (-F c) dump
            execSync(`docker exec ${CONTAINER_NAME} pg_restore -U postgres -d ${TEST_DB} -1 ${DUMP_PATH}`);

            // Re-connect to the new DB utilizing a standalone Pool specifically targeting the cloned DB
            const clonePool = new Pool({
                connectionString: `postgresql://postgres:postgres@localhost:5433/${TEST_DB}`,
                max: 2,
            });

            // Assert that tables successfully restored (e.g. alerts)
            const result = await clonePool.query(`SELECT count(*) FROM alerts`);
            assert.ok(result.rows[0].count !== undefined, 'Cloned schema resolved the Alerts sequence accurately');

            // Assert Indices carried over
            const indexCheck = await clonePool.query(`
                SELECT indexname FROM pg_indexes 
                WHERE tablename = 'alerts' AND indexname = 'idx_alerts_org_status'
            `);
            assert.equal(indexCheck.rowCount, 1, 'Production Composite indexes correctly survived the Pg_Dump and Restoration natively');

            await clonePool.end();
            await pool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        } catch (e: any) {
            console.error('Restore Error:', e.stdout?.toString() || e.message);
            assert.fail('Failed to safely execute Postgres Restoration.');
        }
    });

    t.after(async () => {
        // Cleanup leftover state
        try {
            await pool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        } catch { } // Ignore
    });
});
