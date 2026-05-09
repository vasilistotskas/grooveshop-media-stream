---
name: ImageProcessingProcessor errors bubble up to Bull
description: ImageProcessingProcessor.process() lets all errors throw rather than catching them into {success:false} return values
type: feedback
---

`ImageProcessingProcessor.process()` has no try/catch — errors from cache, HTTP download, or image processing are let bubble up to Bull's job processor wrapper. This preserves Bull's retry/backoff semantics; returning `{ success: false }` would mark the job as succeeded and skip retries.

**Why:** Catching errors and returning `{ success: false }` would silently drop retry attempts — a download failure would be "succeeded" in Bull's eyes.

**How to apply:** Tests for `processor.process(job)` error paths must use `await expect(processor.process(job)).rejects.toThrow(...)` not `expect(result.success).toBe(false)`.
