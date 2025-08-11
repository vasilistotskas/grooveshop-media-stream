# Deprecation Management Guide

This guide helps you identify and fix deprecation warnings in the Grooveshop Media Stream project.

## Quick Check

Run the deprecation checker:
```bash
pnpm run check:deprecations
```

## Common Deprecation Issues

### 1. RxJS Operators

**Issue**: `retryWhen` is deprecated in RxJS 7+
```typescript
// ❌ Deprecated
import { retryWhen, mergeMap } from 'rxjs/operators'

retryWhen(errors =>
  errors.pipe(
    mergeMap((error, attempt) => {
      if (attempt >= maxRetries) {
        return throwError(() => error)
      }
      return timer(delay * 2 ** attempt)
    })
  )
)
```

**Fix**: Use `retry` with delay option
```typescript
// ✅ Modern approach
import { retry } from 'rxjs/operators'

retry({
  count: maxRetries,
  delay: (error, retryCount) => {
    const delay = baseDelay * 2 ** (retryCount - 1)
    return new Promise(resolve => setTimeout(resolve, delay))
  }
})
```

### 2. Node.js Buffer

**Issue**: `new Buffer()` is deprecated
```typescript
// ❌ Deprecated
const buf = new Buffer('hello', 'utf8')
```

**Fix**: Use `Buffer.from()` or `Buffer.alloc()`
```typescript
// ✅ Modern approach
const buf = Buffer.from('hello', 'utf8')
const buf2 = Buffer.alloc(10) // for empty buffer
```

### 3. TypeScript Strict Mode Issues

Many of the TypeScript errors you see are related to strict mode settings that help catch potential runtime issues:

- `error is of type 'unknown'` - Cast error types properly
- `Property is declared but never read` - Remove unused variables
- `Implicit any type` - Add proper type annotations

## Detection Methods

### 1. IDE Warnings
Your IDE should show deprecated APIs with strikethrough text.

### 2. Build Process
```bash
pnpm run build
```

### 3. TypeScript Compiler
```bash
npx tsc --noEmit --strict
```

### 4. Custom Script
```bash
pnpm run check:deprecations
```

## Best Practices

1. **Regular Updates**: Update dependencies regularly to avoid deprecated APIs
2. **IDE Setup**: Configure your IDE to highlight deprecations
3. **CI/CD**: Include deprecation checks in your build pipeline
4. **Documentation**: Keep track of known deprecations in your project

## Fixing Strategy

1. **Identify**: Use the tools above to find deprecations
2. **Research**: Check the library's migration guide
3. **Test**: Ensure the fix doesn't break functionality
4. **Update**: Apply the fix and test thoroughly

## Resources

- [RxJS Migration Guide](https://rxjs.dev/guide/v6/migration)
- [Node.js Deprecation Policy](https://nodejs.org/api/deprecations.html)
- [TypeScript Breaking Changes](https://www.typescriptlang.org/docs/handbook/release-notes/overview.html)