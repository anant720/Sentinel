import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/services/auth.service.js';
import { db } from '../src/lib/database.js';

test('Strict Refresh Token Family Purge Engine', async (t) => {
    // Preserve originals
    const originalQuery = db.query;

    t.after(() => {
        // Restore mocks
        db.query = originalQuery;
    });

    await t.test('Replaying a previously consumed token proactively revokes the entire associated family', async () => {
        const userId = 'user-123';
        const familyId = 'family-abcd';
        const reusedToken = 'old-token';

        // Let's track if the subsequent family purge is called
        let familyPurgeCalled = false;

        // Mock AuthService internal call explicitly
        const originalRevoke = AuthService.revokeTokenFamily;
        AuthService.revokeTokenFamily = async (uId, fId) => {
            if (uId === userId && fId === familyId) {
                familyPurgeCalled = true;
            }
        };

        // Mock DB Query to return an already consumed/revoked Token
        db.query = async (queryText: string, values?: any[]) => {
            return {
                rows: [{
                    id: 'token-567',
                    family_id: familyId,
                    is_revoked: true // The definitive mark of token reuse (replay attack)
                }]
            } as any;
        };

        try {
            // Attempt to consume the reused token
            await AuthService.verifyAndRotateRefreshToken(userId, reusedToken);
            assert.fail('Should have conclusively thrown a reuse error terminating the session');
        } catch (err: any) {
            assert.equal(err.message, 'Invalid or reused refresh token');
        }

        // Verify that the proactive kill-switch executed successfully
        assert.ok(familyPurgeCalled, 'Token reuse must trigger the entire Family Chain revocation procedure');

        // Cleanup sub-mock
        AuthService.revokeTokenFamily = originalRevoke;
    });

    await t.test('Consuming a valid unused token successfully updates its state to revoked (consumed)', async () => {
        const userId = 'user-123';
        const familyId = 'family-xyz';
        const validToken = 'good-token';

        let updateExecuted = false;

        db.query = async (queryText: string, values?: any[]) => {
            if (queryText.includes('UPDATE refresh_tokens SET is_revoked = true')) {
                updateExecuted = true;
                return { rowCount: 1 } as any;
            }

            return {
                rows: [{
                    id: 'token-890',
                    family_id: familyId,
                    is_revoked: false // Valid, never been used
                }]
            } as any;
        };

        const returnedFamilyId = await AuthService.verifyAndRotateRefreshToken(userId, validToken);

        assert.equal(returnedFamilyId, familyId, 'Must propagate the family lineage downstream');
        assert.ok(updateExecuted, 'Must update the token specifically to prevent future replay windows');
    });

});
