// The Fabric global the engine binds on its first surface. Nothing here renders: the DOM host is
// the tree host, so the slot only keeps the event handler the engine registers

import type { IFabricEventHandler } from '@symbiote-native/engine';
import { installInertFabricSlot } from '@symbiote-native/engine/inert-fabric-slot';

export type IWebFabric = {
  // What the engine registered, undefined until its first surface exists
  eventHandler: () => IFabricEventHandler | undefined;
};

// The engine registers its handler once per process, so it has to outlive the slot of a boot
let handler: IFabricEventHandler | undefined;

export function installFabricSlot(): IWebFabric {
  installInertFabricSlot(next => {
    handler = next;
  });
  return { eventHandler: () => handler };
}
