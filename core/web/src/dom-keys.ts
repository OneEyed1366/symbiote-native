// A div with the role of a button, a link or a switch is no native control, so the page gives it
// no click from the keyboard. Each role takes the keys its native control does, Space on release

import type { IEventSource } from './dom-events';
import { isHtmlElement, isNode } from './dom-guards';

const BUTTON = 'button';
const LINK = 'link';
const SWITCH = 'switch';
const ENTER = 'Enter';
const SPACE = ' ';

// The keys that click each role, as the native control of that role takes them
const ACTIVATING_KEYS: Readonly<Record<string, readonly string[]>> = {
  [BUTTON]: [ENTER, SPACE],
  [LINK]: [ENTER],
  [SWITCH]: [SPACE],
};

function controlOf(
  target: EventTarget | null,
  key: string,
): HTMLElement | undefined {
  if (!isNode(target) || !isHtmlElement(target)) return undefined;
  const role = target.getAttribute('role');
  const isActivated =
    role !== null && ACTIVATING_KEYS[role]?.includes(key) === true;
  return isActivated ? target : undefined;
}

// Returns the function that stops forwarding
export function forwardKeyActivation({
  container,
}: Pick<IEventSource, 'container'>): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  container.addEventListener(
    'keydown',
    event => {
      const control = controlOf(event.target, event.key);
      if (control === undefined) return;
      // The press only holds Space back from scrolling the page, the click waits for the release
      if (event.key === SPACE) event.preventDefault();
      else control.click();
    },
    { signal },
  );
  container.addEventListener(
    'keyup',
    event => {
      if (event.key === SPACE) controlOf(event.target, SPACE)?.click();
    },
    { signal },
  );
  return () => controller.abort();
}
