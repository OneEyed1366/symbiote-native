// Watches elements for size and reports the frame relative to the parent, as a device does
// A move without a resize is not seen: ResizeObserver has no event for it

import { isHtmlElement } from './dom-guards';

export type ILayout = { x: number; y: number; width: number; height: number };

type IObserverEntry = { target: Element };

type IObserver = {
  observe: (element: Element) => void;
  unobserve: (element: Element) => void;
};

export type IObserverClass = new (
  callback: (entries: IObserverEntry[]) => void,
) => IObserver;

export type ILayoutWatcher = {
  watch: (element: HTMLElement, target: object) => void;
  unwatch: (element: HTMLElement) => void;
};

function layoutOf(element: HTMLElement): ILayout {
  return {
    x: element.offsetLeft,
    y: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

export function createLayoutWatcher(
  Observer: IObserverClass | undefined,
  deliver: (target: object, layout: ILayout) => void,
): ILayoutWatcher {
  const targets = new Map<Element, object>();
  const observer = Observer
    ? new Observer(entries => {
        for (const { target: element } of entries) {
          const target = targets.get(element);
          // A detached element reads as zero, which is not a layout the app should hear
          if (target === undefined || !isHtmlElement(element)) continue;
          if (element.isConnected) deliver(target, layoutOf(element));
        }
      })
    : undefined;

  return {
    watch(element, target) {
      if (targets.has(element)) return;
      targets.set(element, target);
      observer?.observe(element);
    },
    unwatch(element) {
      if (targets.delete(element)) observer?.unobserve(element);
    },
  };
}
