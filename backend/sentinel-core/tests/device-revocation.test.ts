import test from 'node:test';
import assert from 'node:assert/strict';
import { IngestionController } from '../src/controllers/ingestion.controller.js';
import { DeviceService } from '../src/services/device.service.js';

test('Device Revocation Hard Stop Logic', async (t) => {
    // Preserve originals
    const originalFindDevice = DeviceService.findDeviceById;

    t.after(() => {
        // Restore mocks
        DeviceService.findDeviceById = originalFindDevice;
    });

    await t.test('Ingestion payload from revoked device is immediately rejected 403', async () => {
        // Mock DeviceService to return a revoked device
        DeviceService.findDeviceById = async (orgId, deviceId) => {
            return {
                id: deviceId,
                organization_id: orgId,
                name: 'Test Device',
                public_key: 'fake-key',
                is_active: true, // It might be mechanically active but administratively revoked
                revoked: true,
                created_at: new Date()
            } as any;
        };

        const mockBody = {
            device_id: '123e4567-e89b-12d3-a456-426614174000',
            event_type: 'process.spawn',
            timestamp: Date.now(),
            payload: { process: 'malware.exe' },
            signature: 'fake-sig'
        };

        let sentCode = 0;
        let sentBody: any = null;

        const mockReply = {
            code: (c: number) => {
                sentCode = c;
                return mockReply;
            },
            send: (b: any) => {
                sentBody = b;
                return mockReply;
            }
        };

        const mockRequest = {
            orgId: 'org-1',
            body: mockBody
        };

        await IngestionController.ingest(mockRequest as any, mockReply as any);

        assert.equal(sentCode, 403, 'Should respond with 403 Forbidden');
        assert.equal(sentBody?.error, 'Forbidden');
    });

    await t.test('Ingestion payload from actively enrolled device proceeds to signature validation', async () => {
        // Mock DeviceService to return a completely valid device
        DeviceService.findDeviceById = async (orgId, deviceId) => {
            return {
                id: deviceId,
                organization_id: orgId,
                name: 'Test Device',
                public_key: 'fake-key',
                is_active: true,
                revoked: false, // <-- Valid state
                created_at: new Date()
            } as any;
        };

        // We also need to mock signature validation so it can fail there instead of progressing into actual insertion
        DeviceService.verifySignature = (payloadStr: string, signature: string, publicKey: string) => {
            return false; // Force a 401 Unauthorized for the test to prove it passed 403
        };

        const mockBody = {
            device_id: '123e4567-e89b-12d3-a456-426614174000',
            event_type: 'process.spawn',
            timestamp: Date.now(),
            payload: { process: 'malware.exe' },
            signature: 'fake-sig'
        };

        let sentCode = 0;
        let sentBody: any = null;

        const mockReply = {
            code: (c: number) => {
                sentCode = c;
                return mockReply;
            },
            send: (b: any) => {
                sentBody = b;
                return mockReply;
            }
        };

        const mockRequest = {
            orgId: 'org-1',
            body: mockBody
        };

        await IngestionController.ingest(mockRequest as any, mockReply as any);

        assert.equal(sentCode, 401, 'Should respond with 401 Unauthorized since signature was mocked bad, proving it bypassed 403');
    });
});
