// `focus()` до создания вью, три случая из `TextInput-itest` в RN

import { createElement, useEffect, useLayoutEffect, useRef } from 'react';

import { mount } from '@symbiote-native/react';

import {
  commands,
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const PROBE_ID = 'ti';

type IFocusable = { focus: () => void };

function isFocusable(value: unknown): value is IFocusable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'focus' in value &&
    typeof value.focus === 'function'
  );
}

function focusCommandsFor(tag: number | undefined): number {
  return commands().filter(
    command => command.tag === tag && command.commandName === 'focus',
  ).length;
}

function committedTag(): number | undefined {
  return findByTestId(PROBE_ID, mounted())?.tag;
}

describe('focus() before the view exists', () => {
  it('reaches the view when called from a ref function', () => {
    mount(
      ROOT_TAG,
      createElement('text-input', {
        testID: PROBE_ID,
        ref: (node: unknown) => {
          if (isFocusable(node)) node.focus();
        },
      }),
    );
    flushTimers();

    expect(focusCommandsFor(committedTag())).toBe(1);
  });

  it('reaches the view when called from useLayoutEffect', () => {
    function Component() {
      const input = useRef<unknown>(null);
      useLayoutEffect(() => {
        if (isFocusable(input.current)) input.current.focus();
      }, []);
      return createElement('text-input', { testID: PROBE_ID, ref: input });
    }
    mount(ROOT_TAG, createElement(Component));
    flushTimers();

    expect(focusCommandsFor(committedTag())).toBe(1);
  });

  it('reaches the view when called from useEffect', () => {
    function Component() {
      const input = useRef<unknown>(null);
      useEffect(() => {
        if (isFocusable(input.current)) input.current.focus();
      }, []);
      return createElement('text-input', { testID: PROBE_ID, ref: input });
    }
    mount(ROOT_TAG, createElement(Component));
    flushTimers();

    expect(focusCommandsFor(committedTag())).toBe(1);
  });
});

report();
