import { jest } from '@jest/globals';

// Variables to control mock behavior
let mockDb: any = {};
let mockCrypto: any = {};

// 1. Mock the modules before importing anything else
jest.unstable_mockModule('../src/db/db.js', () => ({
    getUserById: jest.fn((id) => mockDb.getUserById?.(id) ?? Promise.resolve(null)),
    getCredentialByMac: jest.fn((mac) => mockDb.getCredentialByMac?.(mac) ?? Promise.resolve(null)),
    getUserIdByNFCId: jest.fn((nfc) => mockDb.getUserIdByNFCId?.(nfc) ?? Promise.resolve(null)),
    getRingByNFCId: jest.fn((nfc) => mockDb.getRingByNFCId?.(nfc) ?? Promise.resolve(null)),
    getPublicProfileData: jest.fn(),
    getPublicProfileDataById: jest.fn(),
    getProtectedProfileData: jest.fn(),
    updateTokenAmount: jest.fn()
}));

jest.unstable_mockModule('../src/esp/crypto.js', () => ({
    decryptPayload: jest.fn((data) => mockCrypto.decryptPayload?.(data) ?? ''),
    encryptPayload: jest.fn((text) => mockCrypto.encryptPayload?.(text) ?? `encrypted:${text}`)
}));

// 2. Import modules
const request = (await import('supertest')).default;
const { app } = await import('../index.js');
const encryptor = await import('../encryptor.js');

describe('ESP Verification Integration Tests', () => {
    const VALID_MAC = 'AA:BB:CC:DD:EE:FF';
    const VALID_NFC = 'NFC_RING_123';
    const VALID_USER_ID = '00000000-0000-0000-0000-000000000001';

    beforeAll(() => {
        process.env.PROFILE_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
        process.env.SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_PUBLISHABLE_KEY = 'test';
        process.env.SUPABASE_SECRET_KEY = 'test';
        process.env.PRIVATE_PEM_B64 = 'test';
    });

    beforeEach(() => {
        // Reset mock implementations to defaults
        mockDb = {
            getUserById: jest.fn().mockResolvedValue({
                permission: 'yes',
                name: 'Test User',
                image_url: 'http://example.com/img.png',
                timestamp: 'today'
            }),
            getCredentialByMac: jest.fn().mockResolvedValue({
                lat: 40.7128,
                lng: -74.0060,
                radius_m: 200,
                nfc_id: VALID_NFC
            }),
            getUserIdByNFCId: jest.fn().mockResolvedValue({ user_id: VALID_USER_ID }),
            getRingByNFCId: jest.fn().mockResolvedValue({ ring_id: VALID_NFC })
        };
        mockCrypto = {
            decryptPayload: jest.fn().mockReturnValue(JSON.stringify({
                mac: VALID_MAC,
                nfc_id: VALID_NFC,
                timestamp: Math.floor(Date.now() / 1000),
                parsedLat: 40.7128,
                parsedLng: -74.0060
            })),
            encryptPayload: jest.fn().mockImplementation((text) => `encrypted:${text}`)
        };
    });

    it('should return SUCCESS when all conditions are met', async () => {
        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(200);
        expect(response.body.data).toContain('encrypted:SUCCESS');
    });

    it('should return error for replay attack (old timestamp)', async () => {
        mockCrypto.decryptPayload.mockReturnValue(JSON.stringify({
            mac: VALID_MAC,
            nfc_id: VALID_NFC,
            timestamp: Math.floor(Date.now() / 1000) - 300,
            parsedLat: 40.7128,
            parsedLng: -74.0060
        }));

        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(403);
        expect(response.body.data).toContain('encrypted:ERROR: Clock drift too high');
    });

    it('should return error for unrecognized hardware', async () => {
        mockDb.getCredentialByMac.mockResolvedValue(null);

        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(200);
        expect(response.body.data).toContain('encrypted:ACCESS DENIED: Unrecognized Hardware');
    });

    it('should return error for location mismatch', async () => {
        mockCrypto.decryptPayload.mockReturnValue(JSON.stringify({
            mac: VALID_MAC,
            nfc_id: VALID_NFC,
            timestamp: Math.floor(Date.now() / 1000),
            parsedLat: 34.0522,
            parsedLng: -118.2437
        }));

        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(200);
        expect(response.body.data).toContain('encrypted:ACCESS DENIED: Location Mismatch');
    });

    it('should return error for hardware tampering (NFC ID mismatch)', async () => {
        mockCrypto.decryptPayload.mockReturnValue(JSON.stringify({
            mac: VALID_MAC,
            nfc_id: 'WRONG_NFC',
            timestamp: Math.floor(Date.now() / 1000),
            parsedLat: 40.7128,
            parsedLng: -74.0060
        }));
        
        mockDb.getCredentialByMac.mockResolvedValue({
            lat: 40.7128,
            lng: -74.0060,
            radius_m: 200,
            nfc_id: 'VALID_NFC_IN_DB'
        });
        mockDb.getRingByNFCId.mockResolvedValue({ ring_id: 'VALID_NFC_IN_DB' });

        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(200);
        expect(response.body.data).toContain('encrypted:ACCESS DENIED: Hardware Tampered');
    });

    it('should return error for unauthorized user', async () => {
        mockDb.getUserById.mockResolvedValue({
            permission: 'no',
            name: 'Unauthorized User'
        });

        const response = await request(app)
            .post('/api/esp/verify-user-by-id')
            .send({ data: 'some_encrypted_data' });

        expect(response.status).toBe(200);
        expect(response.body.data).toContain('encrypted:ACCESS DENIED: User Unauthorized');
    });

    describe('GET /api/verify-user-by-id/:encryptedId', () => {
        it('should return user info for a valid encrypted ID', async () => {
            const mockUserId = 'user-123';
            const encryptedId = encryptor.encrypt(mockUserId);

            mockDb.getUserById.mockResolvedValue({
                permission: 'yes',
                name: 'Verified User',
                image_url: 'http://example.com/photo.jpg',
                timestamp: '2023-01-01 12:00:00'
            });

            const response = await request(app)
                .get(`/api/verify-user-by-id/${encryptedId}`);

            expect(response.status).toBe(200);
            expect(response.body.user_id).toBe(mockUserId);
            expect(response.body.name).toBe('Verified User');
        });

        it('should return 404 if user is not found', async () => {
            const mockUserId = 'non-existent';
            const encryptedId = encryptor.encrypt(mockUserId);
            
            mockDb.getUserById.mockResolvedValue(null);

            const response = await request(app)
                .get(`/api/verify-user-by-id/${encryptedId}`);

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('User not found');
        });
    });
});
