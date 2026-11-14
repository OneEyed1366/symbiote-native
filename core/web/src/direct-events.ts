// Events that do not bubble but the app listens to on the node: a scroll and an image load
// The container listens in the capture phase, and only a listened node pays for reading sizes

import { hasListenerFor, isSymbioteNode } from '@symbiote-native/engine';
import type { IEventSource } from './dom-events';
import { isHtmlElement, isImageElement, isNode } from './dom-guards';

type IPayload = (element: HTMLElement) => Record<string, unknown>;

// One page event can end as several Fabric events, sent in the order a device sends them
type IDelivery = { top: string; name: string; payload: IPayload };

export function scrollPayload(element: HTMLElement): Record<string, unknown> {
  return {
    contentOffset: { x: element.scrollLeft, y: element.scrollTop },
    contentSize: { width: element.scrollWidth, height: element.scrollHeight },
    layoutMeasurement: {
      width: element.clientWidth,
      height: element.clientHeight,
    },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    zoomScale: 1,
  };
}

function imageOf(element: HTMLElement): HTMLImageElement | undefined {
  return isImageElement(element) ? element : undefined;
}

function imageLoadedPayload(element: HTMLElement): Record<string, unknown> {
  const image = imageOf(element);
  return {
    source: {
      uri: image?.currentSrc ?? '',
      width: image?.naturalWidth ?? 0,
      height: image?.naturalHeight ?? 0,
    },
  };
}

function errorPayload(element: HTMLElement): Record<string, unknown> {
  const image = imageOf(element);
  return { error: `Failed to load ${image?.currentSrc ?? ''}`.trim() };
}

const LOAD_END: IDelivery = {
  top: 'topLoadEnd',
  name: 'loadEnd',
  payload: () => ({}),
};

const DELIVERIES: ReadonlyMap<string, readonly IDelivery[]> = new Map([
  ['scroll', [{ top: 'topScroll', name: 'scroll', payload: scrollPayload }]],
  [
    'load',
    [{ top: 'topLoad', name: 'load', payload: imageLoadedPayload }, LOAD_END],
  ],
  [
    'error',
    [{ top: 'topError', name: 'error', payload: errorPayload }, LOAD_END],
  ],
]);

// Returns the function that stops forwarding
export function forwardDirectEvents({
  container,
  host,
  handler,
}: IEventSource): () => void {
  const controller = new AbortController();
  for (const [type, deliveries] of DELIVERIES) {
    container.addEventListener(
      type,
      event => {
        const element = isNode(event.target) ? event.target : null;
        if (!isHtmlElement(element)) return;
        const target = host.handleAt(element);
        if (!isSymbioteNode(target)) return;
        for (const { top, name, payload } of deliveries) {
          if (hasListenerFor(target, name)) {
            handler()?.(target, top, payload(element));
          }
        }
      },
      { capture: true, signal: controller.signal },
    );
  }
  return () => controller.abort();
}
