// RN's `Pressability-itest`: click, focus and blur reach a pressable, and `onClick` works on a view

import { createElement, type ReactElement } from 'react';

import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
  runWorkLoop,
  type IMountedView,
} from './harness';

const BOX = { height: 100, width: 100 };

type ICallback = () => void;

function pressable(
  props: Record<string, unknown>,
  ...children: ReactElement[]
): ReactElement {
  return createElement('pressable', { style: BOX, ...props }, ...children);
}

function findByNativeId(
  node: IMountedView,
  id: string,
): IMountedView | undefined {
  if (node.props.nativeID === id) return node;
  for (const child of node.children) {
    const found = findByNativeId(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function tagOf(id: string): number {
  const found = findByNativeId(mounted(), id);
  if (found === undefined) throw new Error(`no view with nativeID ${id}`);
  return found.tag;
}

function emit(
  id: string,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  dispatchEvent(tagOf(id), type, payload);
  runWorkLoop();
}

function click(id: string, payload: Record<string, unknown> = {}): void {
  emit(id, 'topClick', payload);
}

function counter(): { calls: () => number; fn: ICallback } {
  let count = 0;
  return {
    calls: () => count,
    fn: () => {
      count += 1;
    },
  };
}

describe('click, focus and blur on a pressable', () => {
  beforeEach(() => createRoot(100, 100));

  it('fires onClick on a plain view', () => {
    const onClick = counter();
    render(
      createElement('view', { nativeID: 'v', style: BOX, onClick: onClick.fn }),
    );

    click('v');

    expect(onClick.calls()).toBe(1);
  });

  it('fires onPress on a click event', () => {
    const onPress = counter();
    render(pressable({ nativeID: 'p', onPress: onPress.fn }));

    click('p');

    expect(onPress.calls()).toBe(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = counter();
    render(pressable({ nativeID: 'p', onPress: onPress.fn, disabled: true }));

    click('p');

    expect(onPress.calls()).toBe(0);
  });

  it('fires onPress after re-enabling', () => {
    const onPress = counter();
    render(pressable({ nativeID: 'p', onPress: onPress.fn, disabled: true }));
    click('p');
    expect(onPress.calls()).toBe(0);

    render(pressable({ nativeID: 'p', onPress: onPress.fn, disabled: false }));
    click('p');

    expect(onPress.calls()).toBe(1);
  });

  it('uses the callback of the latest render', () => {
    const first = counter();
    const second = counter();
    render(pressable({ nativeID: 'p', onPress: first.fn }));
    click('p');

    render(pressable({ nativeID: 'p', onPress: second.fn }));
    click('p');

    expect([first.calls(), second.calls()]).toEqual([1, 1]);
  });

  it('ignores a click that came from a pointer event', () => {
    const onPress = counter();
    render(pressable({ nativeID: 'p', onPress: onPress.fn }));

    click('p', { pointerType: 'mouse' });

    expect(onPress.calls()).toBe(0);
  });

  it('does not press an outer pressable for a click on a nested one', () => {
    const outer = counter();
    const inner = counter();
    render(
      pressable(
        { nativeID: 'outer', onPress: outer.fn },
        pressable({
          nativeID: 'inner',
          onPress: inner.fn,
          style: { height: 10, width: 10 },
        }),
      ),
    );

    click('inner');

    expect([outer.calls(), inner.calls()]).toEqual([0, 1]);
  });

  it('fires onFocus and onBlur', () => {
    const onFocus = counter();
    const onBlur = counter();
    render(
      pressable({ nativeID: 'p', onFocus: onFocus.fn, onBlur: onBlur.fn }),
    );
    expect(onFocus.calls()).toBe(0);

    emit('p', 'topFocus');
    expect([onFocus.calls(), onBlur.calls()]).toEqual([1, 0]);

    emit('p', 'topBlur');
    expect([onFocus.calls(), onBlur.calls()]).toEqual([1, 1]);
  });

  it('does not fire a callback after the pressable unmounts', () => {
    const onPress = counter();
    render(pressable({ nativeID: 'p', onPress: onPress.fn }));
    click('p');
    expect(onPress.calls()).toBe(1);

    // The host refuses events for a detached tag, so unmounting must simply not throw
    render(createElement('view', { nativeID: 'other', style: BOX }));

    expect(findByNativeId(mounted(), 'p')).toBe(undefined);
    expect(onPress.calls()).toBe(1);
  });
});

report();
