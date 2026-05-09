---
name: Single-axis zero dimension is valid for resize
description: validateImageDimensions(0, h) and (w, 0) return true — they mean aspect-ratio-preserving single-axis resize
type: feedback
---

`InputSanitizationService.validateImageDimensions(0, 100)` returns `true`. Single-axis resize requests (one dimension = 0) are explicitly supported: Sharp resizes to the non-zero dimension while preserving aspect ratio.

**Why:** CLAUDE.md documents this: "width=800, height=0 → scale to 800px wide, preserve aspect ratio". Only (0,0) means "use original", and negative values are always invalid.

**How to apply:** Do not test `(0, 100)` or `(100, 0)` as invalid. Test cases for mixed-zero should assert `true`, not `false`. Only test `(-1, x)` or `(x, -1)` for invalid.
