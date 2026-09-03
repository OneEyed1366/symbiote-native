// Runtime globals provided by the Hermes/RN host but absent from the ES2022 lib — mirrors
// core/engine/src/globals.d.ts (a shared package's own `declare global` doesn't reach its
// consumers, so each package needing this declares it itself; see the
// ambient-global-declarations rule).
declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(handle: number | undefined): void;
