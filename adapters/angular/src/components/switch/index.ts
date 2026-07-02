// Base/default Switch. Re-exports the iOS build; Metro picks index.ios.ts / index.android.ts
// in platform bundles. The Angular lifecycle reuses the shared Switch reducer + render fold.

export * from './index.ios';
