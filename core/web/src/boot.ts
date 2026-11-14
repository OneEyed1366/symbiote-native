// What an adapter's web entry runs before it mounts: the DOM host becomes the engine's tree host
// and the container takes a root tag the adapter can hand to `createSurface`

import {
  hasListenerFor,
  isSymbioteNode,
  setTreeHost,
  treeHost,
  type IRootTag,
} from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
import { forwardDirectEvents } from './direct-events';
import { forwardDomEvents } from './dom-events';
import { createDomHost, type IDomHost } from './dom-host';
import { installFabricSlot, type IWebFabric } from './fabric-slot';
import { forwardGestureBlock } from './dom-gestures';
import { forwardKeyActivation } from './dom-keys';
import { forwardInputEvents } from './input-events';
import type { IObserverClass } from './layout-watcher';
import { forwardModalClose } from './modal-events';
import { forwardScrollPhases } from './scroll-phases';
import { forwardSwitchToggle } from './switch-events';

export type IBootOptions = {
  document: Document;
  container: HTMLElement;
  // The page's own `ResizeObserver` unless a test brings another
  observer?: IObserverClass;
};

const TOP_LAYOUT = 'topLayout';
const TOP_LOAD_START = 'topLoadStart';

export type IWebBoot = {
  host: IDomHost;
  rootTag: IRootTag;
  fabric: IWebFabric;
  // Stops forwarding page events to the engine
  dispose: () => void;
};

// Each boot is its own surface, so two containers never share a tag
let nextRootTag = 1;

export function bootWebHost({
  document,
  container,
  observer = document.defaultView?.ResizeObserver,
}: IBootOptions): IWebBoot {
  const fabric = installFabricSlot();
  const host = createDomHost({
    document,
    observer,
    onLayout: (handle, layout) =>
      fabric.eventHandler()?.(handle, TOP_LAYOUT, { layout }),
    // Deferred, as an app that reacts by writing would re-enter the commit that announced it
    onLoadStart: handle => {
      if (!isSymbioteNode(handle) || !hasListenerFor(handle, 'loadStart'))
        return;
      queueMicrotask(() => fabric.eventHandler()?.(handle, TOP_LOAD_START, {}));
    },
  });
  const rootTag = nextRootTag;
  nextRootTag += 1;
  host.registerRoot(rootTag, container);
  // Writes still queued name nodes only the host being replaced knows
  if (treeHost() !== undefined) takeBatch();
  setTreeHost(host);
  const source = { container, host, handler: fabric.eventHandler };
  const stops = [
    forwardDomEvents(source),
    forwardDirectEvents(source),
    forwardInputEvents(source),
    forwardKeyActivation(source),
    forwardGestureBlock(source),
    forwardScrollPhases(source),
    forwardSwitchToggle(source),
    forwardModalClose(source),
  ];
  const dispose = (): void => stops.forEach(stop => stop());
  return { host, rootTag, fabric, dispose };
}
