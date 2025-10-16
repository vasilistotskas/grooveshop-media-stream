import CacheImageRequest, { ResizeOptions } from "../../../MediaStream/API/dto/cache-image-request.dto.js";
import RequestedResizeTargetTooLargeException from "../../../MediaStream/API/exceptions/requested-resize-target-too-large.exception.js";
import ValidateCacheImageRequestResizeTargetRule from "../../../MediaStream/Validation/rules/validate-cache-image-request-resize-target.rule.js";
import ValidateCacheImageRequestRule from "../../../MediaStream/Validation/rules/validate-cache-image-request.rule.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
describe('validateCacheImageRequestResizeTargetRule', ()=>{
    let rule;
    beforeEach(()=>{
        rule = new ValidateCacheImageRequestResizeTargetRule();
    });
    it('should be defined', ()=>{
        expect(rule).toBeDefined();
    });
    it('should allow valid resize options within allowed pixel count', async ()=>{
        const mockRequest = new CacheImageRequest({
            resizeOptions: new ResizeOptions({
                width: 1920,
                height: 1080
            })
        });
        await rule.setup(mockRequest);
        await expect(rule.apply()).resolves.not.toThrow();
    });
    it('should throw an exception when the requested pixel count exceeds the allowed limit', async ()=>{
        const mockRequest = new CacheImageRequest({
            resizeOptions: new ResizeOptions({
                width: 8000,
                height: 5000
            })
        });
        await rule.setup(mockRequest);
        await expect(rule.apply()).rejects.toThrow(RequestedResizeTargetTooLargeException);
    });
});
describe('validateCacheImageRequestRule', ()=>{
    let rule;
    let validateCacheImageRequestResizeTargetRule;
    beforeEach(()=>{
        validateCacheImageRequestResizeTargetRule = new ValidateCacheImageRequestResizeTargetRule();
        rule = new ValidateCacheImageRequestRule(validateCacheImageRequestResizeTargetRule);
    });
    it('should be defined', ()=>{
        expect(rule).toBeDefined();
    });
    it('should setup the request and call the resize target rule setup', async ()=>{
        const mockRequest = new CacheImageRequest({
            resizeOptions: new ResizeOptions({
                width: 1920,
                height: 1080
            })
        });
        const setupSpy = vi.spyOn(validateCacheImageRequestResizeTargetRule, 'setup');
        await rule.setup(mockRequest);
        expect(setupSpy).toHaveBeenCalledWith(mockRequest);
    });
    it('should apply the resize target rule without errors', async ()=>{
        const mockRequest = new CacheImageRequest({
            resizeOptions: new ResizeOptions({
                width: 1920,
                height: 1080
            })
        });
        const applySpy = vi.spyOn(validateCacheImageRequestResizeTargetRule, 'apply').mockResolvedValue(undefined);
        await rule.setup(mockRequest);
        await expect(rule.apply()).resolves.not.toThrow();
        expect(applySpy).toHaveBeenCalled();
    });
    it('should throw an error if the resize target rule throws', async ()=>{
        const mockRequest = new CacheImageRequest({
            resizeOptions: new ResizeOptions({
                width: 8000,
                height: 5000
            })
        });
        vi.spyOn(validateCacheImageRequestResizeTargetRule, 'apply').mockRejectedValue(new Error('Resize error'));
        await rule.setup(mockRequest);
        await expect(rule.apply()).rejects.toThrow('Resize error');
    });
});

//# sourceMappingURL=rule.spec.js.map