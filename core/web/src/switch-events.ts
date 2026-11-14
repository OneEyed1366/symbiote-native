// A click on a switch is the native toggle, which tells the app the value it would move to
// The app keeps the old value unless it writes the new one back

import {
  hasListenerFor,
  isSymbioteNode,
  propOf,
} from '@symbiote-native/engine';
import type { IEventSource } from './dom-events';
import { isHtmlElement, isNode } from './dom-guards';

const ENABLED_SWITCH = '[role=switch]:not([aria-disabled=true])';
const TOP_CHANGE = 'topChange';

// Returns the function that stops forwarding
export function forwardSwitchToggle({
  container,
  host,
  handler,
}: IEventSource): () => void {
  const controller = new AbortController();
  container.addEventListener(
    'click',
    event => {
      const element = isNode(event.target) ? event.target : null;
      if (!isHtmlElement(element) || !element.matches(ENABLED_SWITCH)) return;
      const target = host.handleAt(element);
      if (!isSymbioteNode(target) || !hasListenerFor(target, 'change')) return;
      const isOn = propOf(target, 'value') === true;
      handler()?.(target, TOP_CHANGE, { value: !isOn });
    },
    { signal: controller.signal },
  );
  return () => controller.abort();
}
