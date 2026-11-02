// Values a stack screen reads for its transition, driven by `onTransitionProgress`

import { describe, expect, it, vi } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveStackRoutePlan } from './screen-wiring';
import type { IScreenOptions } from './navigator-props';
import { createNavigationEmitter } from './navigation-events';
import {
  createTransitionProgress,
  createTransitionProgressStore,
  requireTransitionProgress,
} from './transition-progress';

const eventTarget = createElement('RCTView');

function fireTransition(
  handler: unknown,
  nativeEvent: Record<string, unknown>,
): void {
  if (typeof handler !== 'function') {
    throw new Error('no onTransitionProgress handler on the screen props');
  }
  const event: ISymbioteEvent = {
    type: 'onTransitionProgress',
    target: eventTarget,
    currentTarget: eventTarget,
    nativeEvent,
    stopPropagation: () => {},
  };
  handler(event);
}

function planProps(
  options: IScreenOptions,
  transitionProgress?: ReturnType<typeof createTransitionProgress>,
): Record<string, unknown> {
  return resolveStackRoutePlan({
    route: { key: 'a', name: 'A' },
    index: 0,
    routeCount: 1,
    options,
    emitter: createNavigationEmitter(),
    onPop: () => {},
    loggedKeys: new Set(),
    transitionProgress,
  }).screenProps;
}

describe('transition progress values', () => {
  it('start at rest: nothing moved, not closing, not going forward', () => {
    const { progress, closing, goingForward } = createTransitionProgress();

    expect([
      progress.__getValue(),
      closing.__getValue(),
      goingForward.__getValue(),
    ]).toEqual([0, 0, 0]);
  });

  it('follow the native event when the stack gives the screen its progress', () => {
    const transition = createTransitionProgress();
    const props = planProps({}, transition);

    fireTransition(props.onTransitionProgress, {
      progress: 0.5,
      closing: 1,
      goingForward: 0,
    });

    expect([
      transition.progress.__getValue(),
      transition.closing.__getValue(),
      transition.goingForward.__getValue(),
    ]).toEqual([0.5, 1, 0]);
  });

  it('still reports the payload to the `onTransitionProgress` option callback', () => {
    const onTransitionProgress = vi.fn();
    const props = planProps(
      { onTransitionProgress },
      createTransitionProgress(),
    );

    fireTransition(props.onTransitionProgress, {
      progress: 0.25,
      closing: 0,
      goingForward: 1,
    });

    expect(onTransitionProgress).toHaveBeenCalledWith({
      progress: 0.25,
      closing: 0,
      goingForward: 1,
    });
  });

  it('registers no native listener when nobody reads the progress', () => {
    expect(planProps({})).not.toHaveProperty('onTransitionProgress');
  });
});

describe('requireTransitionProgress', () => {
  it('hands back the values of a stack screen', () => {
    const transition = createTransitionProgress();

    expect(requireTransitionProgress(transition)).toBe(transition);
  });

  it('throws a named error for a screen that is not in a stack', () => {
    expect(() => requireTransitionProgress(undefined)).toThrow(
      'useTransitionProgress must be used within a screen rendered by <Stack>',
    );
  });
});

describe('transition progress store', () => {
  it('hands the same values to every render of one route', () => {
    const store = createTransitionProgressStore();

    expect(store.forRoute('a')).toBe(store.forRoute('a'));
    expect(store.forRoute('a')).not.toBe(store.forRoute('b'));
  });

  it('drops the values of a route that left the stack', () => {
    const store = createTransitionProgressStore();
    const first = store.forRoute('a');
    store.forRoute('b');

    store.keepOnly(['b']);

    expect(store.forRoute('a')).not.toBe(first);
  });
});
