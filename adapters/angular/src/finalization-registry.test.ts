// Hermes ships no `FinalizationRegistry`, and `@angular/core` >=22.2 builds one at module load

import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeRegistry = globalThis.FinalizationRegistry;

function removeGlobal(): void {
  Reflect.deleteProperty(globalThis, 'FinalizationRegistry');
}

afterEach(() => {
  Object.defineProperty(globalThis, 'FinalizationRegistry', {
    value: nativeRegistry,
    configurable: true,
    writable: true,
  });
  vi.resetModules();
});

describe('finalization-registry (Positive)', () => {
  it('defines an inert registry when the runtime has none', async () => {
    removeGlobal();
    vi.resetModules();
    await import('./finalization-registry');
    const registry = new FinalizationRegistry(() => undefined);
    expect(registry.register({}, 1)).toBeUndefined();
    expect(registry.unregister({})).toBe(false);
  });
});

describe('finalization-registry (Negative)', () => {
  it('keeps the native registry when the runtime has one', async () => {
    vi.resetModules();
    await import('./finalization-registry');
    expect(globalThis.FinalizationRegistry).toBe(nativeRegistry);
  });
});
