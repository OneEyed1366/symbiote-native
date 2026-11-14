// A Fabric global that does nothing but hand over the event handler the engine registers. For
// hosts that keep the tree themselves and never speak to Fabric

import type { IFabricEventHandler } from './fabric';

export function installInertFabricSlot(
  registerEventHandler: (handler: IFabricEventHandler) => void,
): void {
  Object.assign(globalThis, {
    nativeFabricUIManager: {
      registerEventHandler,
      dispatchCommand(): void {},
      setIsJSResponder(): void {},
      sendAccessibilityEvent(): void {},
      configureNextLayoutAnimation(): void {},
      measure(): void {},
      measureInWindow(): void {},
      measureLayout(): void {},
    },
  });
}
