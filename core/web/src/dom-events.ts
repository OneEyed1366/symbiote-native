// DOM input as the Fabric events the engine already understands. Listeners sit on the container
// and the node under an event is found from its target, so a swapped element loses nothing

import type { IFabricEventHandler } from '@symbiote-native/engine';
import {
  TOUCH_CANCEL,
  TOUCH_END,
  TOUCH_MOVE,
  TOUCH_START,
} from '@symbiote-native/engine/event-names';
import { isElement, isNode } from './dom-guards';
import type { IDomHost } from './dom-host';
import { createTouchTracker, type IGesture } from './dom-touch';

export type IEventSource = {
  container: HTMLElement;
  host: Pick<IDomHost, 'handleAt'>;
  // Read at event time, as the engine registers it with its first surface
  handler: () => IFabricEventHandler | undefined;
};

const CLICK = 'topClick';
const MOUSE = 'mouse';

function nodeOf(target: EventTarget | null): Node | null {
  return isNode(target) ? target : null;
}

function elementOf(target: EventTarget | null): Element | undefined {
  const node = nodeOf(target);
  return isElement(node) ? node : undefined;
}

// Returns the function that stops forwarding
export function forwardDomEvents({
  container,
  host,
  handler,
}: IEventSource): () => void {
  const tracker = createTouchTracker();
  const controller = new AbortController();
  const { signal } = controller;

  const send = (gesture: IGesture | undefined, type: string): void => {
    if (gesture !== undefined) handler()?.(gesture.target, type, gesture.event);
  };

  container.addEventListener(
    'pointerdown',
    event => {
      const element = elementOf(event.target);
      const target = host.handleAt(nodeOf(event.target));
      if (element === undefined || target === undefined) return;
      // Later events of this pointer keep coming here, whatever they land on
      container.setPointerCapture?.(event.pointerId);
      send(tracker.begin(event, target, element), TOUCH_START);
    },
    { signal },
  );
  container.addEventListener(
    'pointermove',
    event => send(tracker.update(event), TOUCH_MOVE),
    { signal },
  );
  container.addEventListener(
    'pointerup',
    event => send(tracker.finish(event), TOUCH_END),
    { signal },
  );
  container.addEventListener(
    'pointercancel',
    event => send(tracker.finish(event), TOUCH_CANCEL),
    { signal },
  );
  container.addEventListener(
    'click',
    event => {
      const target = host.handleAt(nodeOf(event.target));
      if (target === undefined) return;
      // A click with a detail was born of a pointer; the engine reads the missing marker otherwise
      const type = 'pointerType' in event ? event.pointerType : undefined;
      const pointerType =
        typeof type === 'string' && type !== '' ? type : MOUSE;
      handler()?.(target, CLICK, event.detail > 0 ? { pointerType } : {});
    },
    { signal },
  );
  return () => controller.abort();
}
