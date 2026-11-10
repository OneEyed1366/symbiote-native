import { vi } from 'vitest';

// The worklets mock supplies `requestAnimationFrame` and nothing to cancel it
// Install this before the fake clock, which then takes both over as a pair
export function stubCancelAnimationFrame(): void {
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
}
