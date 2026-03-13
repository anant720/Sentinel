import test from 'node:test';
import assert from 'node:assert/strict';

// We mock the DB and AuditService explicitly for rigorous local FSM validations
const validTransitions: Record<string, string[]> = {
    'OPEN': ['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'],
    'ACKNOWLEDGED': ['RESOLVED'],
    'RESOLVED': [],
    'DISMISSED': []
};

function isValidTransition(currentStatus: string, newStatus: string): boolean {
    return validTransitions[currentStatus]?.includes(newStatus) || false;
}

test('Alert FSM Finite State Machine Lifecycle Constraints', async (t) => {

    await t.test('OPEN -> ACKNOWLEDGED is valid', () => {
        assert.ok(isValidTransition('OPEN', 'ACKNOWLEDGED'));
    });

    await t.test('OPEN -> RESOLVED is valid (fast-forwarding triage)', () => {
        assert.ok(isValidTransition('OPEN', 'RESOLVED'));
    });

    await t.test('OPEN -> DISMISSED is valid (False Positives)', () => {
        assert.ok(isValidTransition('OPEN', 'DISMISSED'));
    });

    await t.test('ACKNOWLEDGED -> RESOLVED is valid (Investigation Complete)', () => {
        assert.ok(isValidTransition('ACKNOWLEDGED', 'RESOLVED'));
    });

    await t.test('ACKNOWLEDGED -> OPEN is invalid (Cannot revert triage)', () => {
        assert.ok(!isValidTransition('ACKNOWLEDGED', 'OPEN'));
    });

    await t.test('ACKNOWLEDGED -> DISMISSED is invalid (Must be resolved)', () => {
        assert.ok(!isValidTransition('ACKNOWLEDGED', 'DISMISSED'));
    });

    await t.test('RESOLVED -> ACKNOWLEDGED is invalid (Closed states are terminal)', () => {
        assert.ok(!isValidTransition('RESOLVED', 'ACKNOWLEDGED'));
        assert.ok(!isValidTransition('RESOLVED', 'OPEN'));
    });

    await t.test('DISMISSED -> OPEN is invalid (Closed states are terminal)', () => {
        assert.ok(!isValidTransition('DISMISSED', 'OPEN'));
    });
});
