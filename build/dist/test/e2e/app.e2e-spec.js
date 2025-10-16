import * as process from "node:process";
import MediaStreamModule from "../../MediaStream/media-stream.module.js";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
describe('MediaStreamModule (e2e)', ()=>{
    let app;
    let moduleFixture;
    beforeAll(async ()=>{
        // Disable scheduled tasks in e2e tests
        process.env.DISABLE_CRON = 'true';
        moduleFixture = await Test.createTestingModule({
            imports: [
                MediaStreamModule
            ]
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    afterAll(async ()=>{
        // Close the application first
        try {
            if (app) {
                await app.close();
            }
        } catch (error) {
            // Ignore "Connection is closed" errors - they're expected in cleanup
            if (!(error instanceof Error) || !error.message.includes('Connection is closed')) {
                console.error('Error closing app:', error);
            }
        }
        // Close the module fixture
        try {
            if (moduleFixture) {
                await moduleFixture.close();
            }
        } catch (error) {
            // Ignore "Connection is closed" errors - they're expected in cleanup
            if (!(error instanceof Error) || !error.message.includes('Connection is closed')) {
                console.error('Error closing module:', error);
            }
        }
        // Give extra time for all async operations to complete
        // This includes Redis disconnection, Bull queue cleanup, and scheduled tasks
        await new Promise((resolve)=>setTimeout(resolve, 1000));
    });
    // eslint-disable-next-line test/expect-expect
    it('/metrics (GET)', ()=>{
        return request(app.getHttpServer()).get('/metrics').expect(200).expect('Content-Type', /text\/plain/);
    });
    it('/metrics/health (GET)', ()=>{
        return request(app.getHttpServer()).get('/metrics/health').expect(200).expect((res)=>{
            expect(res.body).toHaveProperty('status');
            expect(res.body).toHaveProperty('timestamp');
            expect(res.body).toHaveProperty('service');
        });
    });
    it('/health/live (GET)', ()=>{
        return request(app.getHttpServer()).get('/health/live').expect(200).expect((res)=>{
            expect(res.body).toHaveProperty('status', 'alive');
            expect(res.body).toHaveProperty('uptime');
        });
    });
});

//# sourceMappingURL=app.e2e-spec.js.map