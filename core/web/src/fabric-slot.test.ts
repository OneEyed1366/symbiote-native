// The engine registers its event handler once per process, so a page that boots the host again
// still has to reach it through the new slot

import { describe, expect, it } from 'vitest';
import { installFabricSlot } from './fabric-slot';

describe('web fabric slot', () => {
  it('hands over the handler the engine registered', () => {
    const fabric = installFabricSlot();
    const handler = (): void => {};

    globalThis.nativeFabricUIManager?.registerEventHandler(handler);

    expect(fabric.eventHandler()).toBe(handler);
  });

  it('keeps that handler for the slot of a later boot', () => {
    installFabricSlot();
    const handler = (): void => {};
    globalThis.nativeFabricUIManager?.registerEventHandler(handler);

    const later = installFabricSlot();

    expect(later.eventHandler()).toBe(handler);
  });

  it('lets a handler registered on the later slot replace it', () => {
    installFabricSlot();
    globalThis.nativeFabricUIManager?.registerEventHandler((): void => {});
    const later = installFabricSlot();
    const replacement = (): void => {};

    globalThis.nativeFabricUIManager?.registerEventHandler(replacement);

    expect(later.eventHandler()).toBe(replacement);
  });
});
