// The phases of a scroll as a device reports them: a drag lasts while a finger is down, and every
// scroll without one is a glide that ends with `scrollend`. The container listens in the capture
// phase, as none of these events bubbles

import {
  hasListenerFor,
  isRecord,
  isSymbioteNode,
} from '@symbiote-native/engine';
import { scrollPayload } from './direct-events';
import type { IEventSource } from './dom-events';
import { isHtmlElement, isNode } from './dom-guards';

type IPhase = 'dragging' | 'gliding';

type ISendPhase = (element: HTMLElement, name: string, top: string) => void;

// Kept apart from the listeners so the state machine reads on its own
type ITracker = {
  fingerDown: () => void;
  fingersLeft: (count: number) => void;
  scrolled: (element: HTMLElement) => void;
  scrollEnded: (element: HTMLElement) => void;
};

// How many fingers stay down once this touch event is over
function fingersAfter(event: Event): number {
  if (!('touches' in event)) return 0;
  const { touches } = event;
  return isRecord(touches) && typeof touches.length === 'number'
    ? touches.length
    : 0;
}

function createTracker(send: ISendPhase): ITracker {
  const phases = new Map<HTMLElement, IPhase>();
  let isFingerDown = false;
  return {
    fingerDown() {
      isFingerDown = true;
    },
    fingersLeft(count) {
      isFingerDown = count > 0;
      if (isFingerDown) return;
      for (const [element, phase] of phases) {
        if (phase !== 'dragging') continue;
        phases.delete(element);
        send(element, 'scrollEndDrag', 'topScrollEndDrag');
      }
    },
    scrolled(element) {
      const phase = phases.get(element);
      if (isFingerDown && phase !== 'dragging') {
        phases.set(element, 'dragging');
        send(element, 'scrollBeginDrag', 'topScrollBeginDrag');
      } else if (!isFingerDown && phase === undefined) {
        phases.set(element, 'gliding');
        send(element, 'momentumScrollBegin', 'topMomentumScrollBegin');
      }
    },
    scrollEnded(element) {
      if (phases.get(element) !== 'gliding') return;
      phases.delete(element);
      send(element, 'momentumScrollEnd', 'topMomentumScrollEnd');
    },
  };
}

// Returns the function that stops forwarding
export function forwardScrollPhases({
  container,
  host,
  handler,
}: IEventSource): () => void {
  const controller = new AbortController();
  const options = { capture: true, passive: true, signal: controller.signal };
  const tracker = createTracker((element, name, top) => {
    const target = host.handleAt(element);
    if (!isSymbioteNode(target) || !hasListenerFor(target, name)) return;
    handler()?.(target, top, scrollPayload(element));
  });
  const onElement =
    (act: (element: HTMLElement) => void) =>
    ({ target }: Event): void => {
      if (isNode(target) && isHtmlElement(target)) act(target);
    };

  container.addEventListener('touchstart', () => tracker.fingerDown(), options);
  container.addEventListener(
    'touchend',
    event => tracker.fingersLeft(fingersAfter(event)),
    options,
  );
  container.addEventListener('scroll', onElement(tracker.scrolled), options);
  container.addEventListener(
    'scrollend',
    onElement(tracker.scrollEnded),
    options,
  );
  return () => controller.abort();
}
