// @vitest-environment happy-dom
// Следим за размером элемента с `onLayout` и отдаём рамку относительно родителя

import { beforeEach, describe, expect, it } from 'vitest';
import { createLayoutWatcher, type ILayout } from './layout-watcher';

type ICallback = (entries: { target: Element }[]) => void;

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed = new Set<Element>();

  constructor(readonly callback: ICallback) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  fire(element: Element): void {
    this.callback([{ target: element }]);
  }
}

function box(frame: ILayout): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  Object.defineProperties(element, {
    offsetLeft: { value: frame.x },
    offsetTop: { value: frame.y },
    offsetWidth: { value: frame.width },
    offsetHeight: { value: frame.height },
  });
  return element;
}

describe('layout watcher', () => {
  let delivered: { target: object; layout: ILayout }[];

  beforeEach(() => {
    FakeObserver.instances = [];
    delivered = [];
  });

  const watcher = (): ReturnType<typeof createLayoutWatcher> =>
    createLayoutWatcher(FakeObserver, (target, layout) =>
      delivered.push({ target, layout }),
    );

  it('reports the frame of a watched element when the browser says it resized', () => {
    const element = box({ x: 4, y: 6, width: 100, height: 40 });
    const target = {};
    watcher().watch(element, target);

    FakeObserver.instances[0]?.fire(element);

    expect(delivered).toEqual([
      { target, layout: { x: 4, y: 6, width: 100, height: 40 } },
    ]);
  });

  it('stops reporting after unwatch', () => {
    const element = box({ x: 0, y: 0, width: 1, height: 1 });
    const layout = watcher();
    layout.watch(element, {});
    layout.unwatch(element);

    FakeObserver.instances[0]?.fire(element);

    expect(delivered).toEqual([]);
    expect(FakeObserver.instances[0]?.observed.size).toBe(0);
  });

  it('watches one element once however often it is asked', () => {
    const element = box({ x: 0, y: 0, width: 1, height: 1 });
    const layout = watcher();
    layout.watch(element, {});
    layout.watch(element, {});

    FakeObserver.instances[0]?.fire(element);

    expect(delivered).toHaveLength(1);
  });

  it('stays silent for an element that left the page', () => {
    const element = box({ x: 0, y: 0, width: 0, height: 0 });
    watcher().watch(element, {});
    element.remove();

    FakeObserver.instances[0]?.fire(element);

    expect(delivered).toEqual([]);
  });

  it('does nothing in a browser without a ResizeObserver', () => {
    const element = box({ x: 0, y: 0, width: 1, height: 1 });

    expect(() =>
      createLayoutWatcher(undefined, () => {}).watch(element, {}),
    ).not.toThrow();
  });
});
