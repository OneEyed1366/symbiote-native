// What an app asks of a ref: commands, measuring and the accessibility focus. Each answer comes
// from the element the node stands for

import type { IDomRect, ITreeHost } from '@symbiote-native/engine';
import { isHtmlElement, isTextField } from './dom-guards';
import type { IDomNode } from './dom-node';
import { writeTextAndSelection } from './input-text';

export type IImperative = Pick<
  ITreeHost,
  | 'dispatchCommand'
  | 'sendAccessibilityEvent'
  | 'measure'
  | 'measureInWindow'
  | 'measureLayout'
> & {
  getBoundingClientRect: (
    handle: object,
    includeTransform: boolean,
  ) => IDomRect | undefined;
};

type ICommand = (
  element: HTMLElement,
  node: IDomNode,
  args: readonly unknown[],
) => void;

const HORIZONTAL_SCROLL = 'horizontal-scroll-view';
const FOCUS_EVENT = 'focus';

// A command without a meaning on the page (the scroll bar flash) is dropped
const COMMANDS: ReadonlyMap<string, ICommand> = new Map<string, ICommand>([
  ['focus', element => element.focus()],
  [
    'setTextAndSelection',
    (element, node, args) => {
      if (isTextField(element))
        writeTextAndSelection(element, node.handle, args);
    },
  ],
  ['blur', element => element.blur()],
  [
    'scrollTo',
    (element, _node, [x, y, isAnimated]) =>
      element.scrollTo({
        left: typeof x === 'number' ? x : 0,
        top: typeof y === 'number' ? y : 0,
        behavior: behaviorOf(isAnimated),
      }),
  ],
  [
    'scrollToEnd',
    (element, node, [isAnimated]) => {
      const behavior = behaviorOf(isAnimated);
      if (node.tagName === HORIZONTAL_SCROLL) {
        element.scrollTo({ left: element.scrollWidth, behavior });
      } else {
        element.scrollTo({ top: element.scrollHeight, behavior });
      }
    },
  ],
]);

// RN animates unless told not to, and `auto` would hand the choice to the page's own css
function behaviorOf(isAnimated: unknown): ScrollBehavior {
  return isAnimated === false ? 'instant' : 'smooth';
}

export function createImperative(
  nodeOf: (handle: object) => IDomNode,
): IImperative {
  const elementOf = (handle: object): HTMLElement | undefined => {
    const { dom } = nodeOf(handle);
    return isHtmlElement(dom) ? dom : undefined;
  };

  return {
    dispatchCommand(handle, commandName, args) {
      const element = elementOf(handle);
      if (element === undefined) return;
      COMMANDS.get(commandName)?.(element, nodeOf(handle), args);
    },
    sendAccessibilityEvent(handle, eventType) {
      if (eventType === FOCUS_EVENT) elementOf(handle)?.focus();
    },
    measure(handle, callback) {
      const element = elementOf(handle);
      if (element === undefined) return;
      const rect = element.getBoundingClientRect();
      const view = element.ownerDocument.defaultView;
      callback(
        element.offsetLeft,
        element.offsetTop,
        rect.width,
        rect.height,
        rect.left + (view?.scrollX ?? 0),
        rect.top + (view?.scrollY ?? 0),
      );
    },
    measureInWindow(handle, callback) {
      const rect = elementOf(handle)?.getBoundingClientRect();
      if (rect !== undefined) {
        callback(rect.left, rect.top, rect.width, rect.height);
      }
    },
    measureLayout(handle, relativeTo, onFail, onSuccess) {
      const rect = elementOf(handle)?.getBoundingClientRect();
      const origin = elementOf(relativeTo)?.getBoundingClientRect();
      if (rect === undefined || origin === undefined) {
        onFail();
        return;
      }
      onSuccess(
        rect.left - origin.left,
        rect.top - origin.top,
        rect.width,
        rect.height,
      );
    },
    getBoundingClientRect(handle) {
      const rect = elementOf(handle)?.getBoundingClientRect();
      if (rect === undefined) return undefined;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
  };
}
