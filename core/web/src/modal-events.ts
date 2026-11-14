// Escape asks the topmost modal to close, as the back button of a device does
// The app closes it by writing `visible` back, and a modal without `onRequestClose` stays open

import { hasListenerFor, isSymbioteNode } from '@symbiote-native/engine';
import type { IEventSource } from './dom-events';

const DIALOG = '[role=dialog][aria-modal=true]';
const ESCAPE = 'Escape';
const TOP_REQUEST_CLOSE = 'topRequestClose';

// Returns the function that stops forwarding
export function forwardModalClose({
  container,
  host,
  handler,
}: IEventSource): () => void {
  const controller = new AbortController();
  container.ownerDocument.addEventListener(
    'keydown',
    event => {
      if (event.key !== ESCAPE) return;
      const target = host.handleAt(
        [...container.querySelectorAll(DIALOG)].at(-1) ?? null,
      );
      if (!isSymbioteNode(target) || !hasListenerFor(target, 'requestClose')) {
        return;
      }
      handler()?.(target, TOP_REQUEST_CLOSE, {});
    },
    { signal: controller.signal },
  );
  return () => controller.abort();
}
