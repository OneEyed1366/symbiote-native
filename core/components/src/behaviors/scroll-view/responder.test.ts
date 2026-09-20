// ScrollView's own participation in the responder negotiation (`./responder.ts`) — ported from
// `ScrollView.js:1263-1546`. Exercises the dispatched listener the same way `pressable.test.ts`'s
// `listenerOf` does: through `setBehaviorListener`'s real slot, not a bypassed pure-function call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '../../../../test-utils/src/index';
import {
  appListenerFor,
  clearHostBehaviors,
  createElement,
  createSurface,
  currentlyFocusedInput,
  Keyboard,
  routeProp,
  setInputBlurred,
  setInputFocused,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { TEXT_INPUT_TAG } from '../text-input';
import { registerScrollViewBehavior, SCROLL_VIEW_TAG } from './index';

const fabric = installRecordingFabric();
let nextRootTag = 9800;

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) {
    throw new Error(`no "${name}" listener installed`);
  }
  return listener;
}

function mount(node: ISymbioteNode): void {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
}

function makeScrollView(): ISymbioteNode {
  const descriptor = descriptorFor(SCROLL_VIEW_TAG);
  return createElement(descriptor.component, false, SCROLL_VIEW_TAG);
}

function makeTextInput(): ISymbioteNode {
  const descriptor = descriptorFor(TEXT_INPUT_TAG);
  return createElement(descriptor.component, false, TEXT_INPUT_TAG);
}

function makePlainView(): ISymbioteNode {
  return createElement('RCTView', false, 'view');
}

function eventWithTarget(target: ISymbioteNode): ISymbioteEvent {
  return {
    nativeEvent: { changedTouches: [{ target }], touches: [{ target }] },
  } as ISymbioteEvent;
}

const KEYBOARD_METRICS = { screenX: 0, screenY: 300, width: 390, height: 346 };

let metricsSpy: ReturnType<typeof vi.spyOn>;
let focusedInput: ISymbioteNode | undefined;

beforeEach(() => {
  registerScrollViewBehavior();
  metricsSpy = vi.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
});

afterEach(() => {
  metricsSpy.mockRestore();
  if (focusedInput !== undefined) setInputBlurred(focusedInput);
  focusedInput = undefined;
  clearHostBehaviors();
  fabric.reset();
});

describe('startShouldSetResponderCapture', () => {
  it('claims the tap while a momentum scroll is in flight, regardless of keyboard state', () => {
    const owner = makeScrollView();
    mount(owner);
    listenerOf(
      owner,
      'momentumScrollBegin',
    )({ nativeEvent: {} } as ISymbioteEvent);
    const other = makePlainView();
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(true);
  });

  it('claims a tap on a non-text-input while the default (never) persists and the keyboard is up', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(true);
  });

  it('does not steal a tap that landed on the focused input itself', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(input)),
    ).toBe(false);
  });

  it('never claims when keyboardShouldPersistTaps is "always", even with the keyboard up', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    routeProp(owner, 'keyboardShouldPersistTaps', 'always');
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(false);
  });

  // RN's own order (`ScrollView.js:1474-1481`): the animating claim runs BEFORE the
  // `disableScrollViewPanResponder` check, so it is NOT gated by the flag. Matched, not "fixed".
  it('the animating claim is unconditional, not gated by disableScrollViewPanResponder', () => {
    const owner = makeScrollView();
    mount(owner);
    routeProp(owner, 'disableScrollViewPanResponder', true);
    const other = makePlainView();
    listenerOf(
      owner,
      'momentumScrollBegin',
    )({ nativeEvent: {} } as ISymbioteEvent);
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(true);
  });

  it('disableScrollViewPanResponder gates the keyboard-dismiss claim', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    routeProp(owner, 'disableScrollViewPanResponder', true);
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(false);
  });

  it('does not claim with no keyboard up at all', () => {
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(
        owner,
        'startShouldSetResponderCapture',
      )(eventWithTarget(other)),
    ).toBe(false);
  });
});

describe('startShouldSetResponder (bubble phase, "handled" mode)', () => {
  it('claims a tap that did not land on the focused input when keyboardShouldPersistTaps is "handled"', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    routeProp(owner, 'keyboardShouldPersistTaps', 'handled');
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(owner, 'startShouldSetResponder')(eventWithTarget(other)),
    ).toBe(true);
  });

  it('does not claim in the default mode', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    const other = makePlainView();
    expect(
      listenerOf(owner, 'startShouldSetResponder')(eventWithTarget(other)),
    ).toBe(false);
  });
});

describe('responderTerminationRequest', () => {
  it('allows giving up the responder until a real scroll is observed, then refuses', () => {
    const owner = makeScrollView();
    mount(owner);
    listenerOf(owner, 'responderGrant')({ nativeEvent: {} } as ISymbioteEvent);
    expect(
      listenerOf(owner, 'responderTerminationRequest')({} as ISymbioteEvent),
    ).toBe(true);
    listenerOf(owner, 'scroll')({ nativeEvent: {} } as ISymbioteEvent);
    expect(
      listenerOf(owner, 'responderTerminationRequest')({} as ISymbioteEvent),
    ).toBe(false);
  });
});

describe('responderRelease dismisses the keyboard', () => {
  it('blurs the focused input on release, if nothing was scrolled and the tap missed it', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    listenerOf(owner, 'responderGrant')({ nativeEvent: {} } as ISymbioteEvent);
    const other = makePlainView();
    listenerOf(owner, 'responderRelease')(eventWithTarget(other));
    expect(currentlyFocusedInput()).toBeNull();
    focusedInput = undefined;
  });

  it('leaves focus alone once a real scroll happened since becoming responder', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    setInputFocused(input);
    focusedInput = input;
    listenerOf(owner, 'responderGrant')({ nativeEvent: {} } as ISymbioteEvent);
    listenerOf(owner, 'scroll')({ nativeEvent: {} } as ISymbioteEvent);
    const other = makePlainView();
    listenerOf(owner, 'responderRelease')(eventWithTarget(other));
    expect(currentlyFocusedInput()).toBe(input);
  });

  it('leaves focus alone when keyboardShouldPersistTaps is "always"', () => {
    metricsSpy.mockReturnValue(KEYBOARD_METRICS);
    const owner = makeScrollView();
    const input = makeTextInput();
    mount(owner);
    routeProp(owner, 'keyboardShouldPersistTaps', 'always');
    setInputFocused(input);
    focusedInput = input;
    listenerOf(owner, 'responderGrant')({ nativeEvent: {} } as ISymbioteEvent);
    const other = makePlainView();
    listenerOf(owner, 'responderRelease')(eventWithTarget(other));
    expect(currentlyFocusedInput()).toBe(input);
  });
});

describe('an app-supplied handler still fires (composition, not eviction)', () => {
  it('calls the app onResponderGrant/onResponderRelease/onMomentumScrollBegin/onMomentumScrollEnd', () => {
    const owner = makeScrollView();
    mount(owner);
    const calls: string[] = [];
    const onMomentumScrollBegin = (): void => {
      calls.push('begin');
    };
    routeProp(owner, 'onResponderGrant', () => calls.push('grant'));
    routeProp(owner, 'onResponderRelease', () => calls.push('release'));
    routeProp(owner, 'onMomentumScrollBegin', onMomentumScrollBegin);
    routeProp(owner, 'onMomentumScrollEnd', () => calls.push('end'));

    // The real risk this guards against: `routeProp` writing the app's callback STRAIGHT into
    // `node.listeners` (an unowned name) rather than the STASH, which would silently evict
    // whatever `installResponderPredicates` put there at `attach`. Both paths wrap the callback in
    // a fresh closure before it ever reaches `node.listeners`, so an identity check on the raw
    // listener slot can't tell them apart — only the stash can: it is populated ONLY on the owned
    // path (`setEventListener`'s `stashAppListener` branch), so an unowned name reads back
    // `undefined` here regardless of whether `calls` below still fires.
    expect(appListenerFor(owner, 'momentumScrollBegin')).toBe(
      onMomentumScrollBegin,
    );

    listenerOf(
      owner,
      'momentumScrollBegin',
    )({ nativeEvent: {} } as ISymbioteEvent);
    listenerOf(owner, 'responderGrant')({ nativeEvent: {} } as ISymbioteEvent);
    listenerOf(
      owner,
      'responderRelease',
    )({ nativeEvent: {} } as ISymbioteEvent);
    listenerOf(
      owner,
      'momentumScrollEnd',
    )({ nativeEvent: {} } as ISymbioteEvent);

    expect(calls).toEqual(['begin', 'grant', 'release', 'end']);
  });
});
