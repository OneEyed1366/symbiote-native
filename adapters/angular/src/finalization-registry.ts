// Hermes has no `FinalizationRegistry`, and `@angular/core` >=22.2 builds one at module load
// Cleanup callbacks never fire, which only costs Angular's signal debug bookkeeping

class InertFinalizationRegistry {
  register(): void {}

  unregister(): boolean {
    return false;
  }
}

if (typeof globalThis.FinalizationRegistry === 'undefined') {
  Object.defineProperty(globalThis, 'FinalizationRegistry', {
    value: InertFinalizationRegistry,
    configurable: true,
    writable: true,
  });
}
