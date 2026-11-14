// A pan is stopped by cancelling its first `touchmove`, and only a non-passive listener may do so
// The page cannot know the app owns the gesture, so the host cancels while the claim stands

import type { IDomHost } from './dom-host';

// Returns the function that stops forwarding
export function forwardGestureBlock({
  container,
  host,
}: {
  container: HTMLElement;
  host: Pick<IDomHost, 'blocksNative'>;
}): () => void {
  const controller = new AbortController();
  container.addEventListener(
    'touchmove',
    event => {
      if (host.blocksNative() && event.cancelable) event.preventDefault();
    },
    { passive: false, signal: controller.signal },
  );
  return () => controller.abort();
}
