// TouchableNativeFeedback as a TAG, Android half — the ripple background and the two view
// commands, neither of which exists off Android (TouchableNativeFeedback.js:257,276,402). Its own
// file because `Platform.OS` is read at module load.
//
// The mock replaces `select` as well as `OS`, matching `button-android.test.ts`: `platform/
// index.ios.ts` hardcodes `if ('ios' in spec) return spec.ios`, so a mock supplying only `OS` would
// leave shared code on the iOS branch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFabric, type IFakeNode } from '../../../test-utils/src/index';

vi.mock('@symbiote-native/engine', async () => {
  const actual = await vi.importActual<
    typeof import('@symbiote-native/engine')
  >('@symbiote-native/engine');
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      OS: 'android',
      Version: 33,
      select: <T>(spec: {
        android?: T;
        ios?: T;
        native?: T;
        default?: T;
      }): T | undefined => {
        if ('android' in spec) return spec.android;
        if ('native' in spec) return spec.native;
        return spec.default;
      },
    },
  };
});

const {
  appendChild: engineAppend,
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
} = await import('@symbiote-native/engine');
type IListener = import('@symbiote-native/engine').IListener;
type ISymbioteEvent = import('@symbiote-native/engine').ISymbioteEvent;
type ISymbioteNode = import('@symbiote-native/engine').ISymbioteNode;
const { descriptorFor } = await import('../component-names');
const {
  registerTouchableNativeFeedbackBehavior,
  TOUCHABLE_NATIVE_FEEDBACK_TAG,
} = await import('./touchable-native-feedback');

const fabric = installFabric();
let nextRootTag = 7700;

const ROOT_TEST_ID = 'root';
const SUBJECT_TEST_ID = 'subject';

// TouchableNativeFeedback.js:343-348 — no `background` prop means TNF resolves SelectableBackground
// onto the background slot.
const SELECTABLE_BACKGROUND = {
  type: 'ThemeAttrAndroid',
  attribute: 'selectableItemBackground',
  rippleRadius: undefined,
};

function touchAt(x: number, y: number): ISymbioteEvent {
  return { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y } };
}

function nodeFor(intrinsic: 'view' | 'touchable-native-feedback') {
  const descriptor = descriptorFor(intrinsic);
  return createElement(descriptor.component, descriptor.isText, intrinsic);
}

function mount(ownerProps: Readonly<Record<string, unknown>> = {}) {
  const root = nodeFor('view');
  routeProp(root, 'testID', ROOT_TEST_ID);
  const owner = nodeFor('touchable-native-feedback');
  routeProp(owner, 'testID', SUBJECT_TEST_ID);
  for (const [key, value] of Object.entries(ownerProps))
    routeProp(owner, key, value);
  const child = nodeFor('view');

  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(root);
  engineAppend(root, owner);
  engineAppend(owner, child);
  surface.commit();
  return { root, owner, child, surface };
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

function subject(): IFakeNode {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === SUBJECT_TEST_ID) return node;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error('no committed subject');
  return hit;
}

beforeEach(() => {
  vi.useFakeTimers();
  fabric.commands.length = 0;
  registerTouchableNativeFeedbackBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('touchable-native-feedback host behavior on Android', () => {
  // Still ONE node — the ripple is a PROP of the child, not a view of its own. Our five wrappers
  // paint it through a dedicated inner View, which is where the whole family's extra node came
  // from.
  it('paints the selectable background on the child, adding no node', () => {
    mount();

    const committed = subject();
    expect(committed.props.nativeBackgroundAndroid).toEqual(
      SELECTABLE_BACKGROUND,
    );
    expect(Object.keys(committed.props)).not.toContain(
      'nativeForegroundAndroid',
    );
    expect(committed.children).toHaveLength(0);
  });

  // :343-348 + :402 — an explicit background, and `useForeground` picking the other slot.
  it('honours background and useForeground', () => {
    mount({
      background: { type: 'RippleAndroid', color: '#ff0000', borderless: true },
      useForeground: true,
    });

    const committed = subject();
    expect(committed.props.nativeForegroundAndroid).toEqual({
      type: 'RippleAndroid',
      color: '#ff0000',
      borderless: true,
      rippleRadius: undefined,
    });
    expect(Object.keys(committed.props)).not.toContain(
      'nativeBackgroundAndroid',
    );
    // Neither TNF prop may reach Fabric raw — no ViewConfig declares them, so a leak is silent.
    expect(Object.keys(committed.props)).not.toContain('background');
    expect(Object.keys(committed.props)).not.toContain('useForeground');
  });

  // :230-252. Without these the drawable is installed and never animates: the JS responder consumes
  // the touch, so Android's own pressed-state handling never fires and the child looks dead while
  // every callback runs. And the commands must land on the CHILD — the tag has no Fabric view to
  // dispatch at.
  it('drives the ripple with hotspotUpdate and setPressed, on the child', () => {
    const onPress = vi.fn();
    const { child } = mount({ onPress });
    const committed = subject();
    fabric.commands.length = 0;

    // NO timer is advanced anywhere in this gesture, and that IS the `minPressDuration: 0`
    // assertion (:226): the press machine's 130 ms deactivation floor defers `onPressOut`, so with
    // the floor left in place the release below dispatches nothing and the ripple stays lit after
    // the finger is gone — while a test that advanced its timers first would see the command anyway.
    listenerOf(child, 'pressIn')(touchAt(12, 34));
    listenerOf(child, 'startShouldSetResponder')(touchAt(12, 34));
    expect(fabric.commands.map(c => c.commandName)).toEqual([
      'hotspotUpdate',
      'setPressed',
    ]);
    expect(fabric.commands[0].args).toEqual([12, 34]);
    expect(fabric.commands[0].node).toBe(committed);
    expect(fabric.commands[1].args).toEqual([true]);

    fabric.commands.length = 0;
    listenerOf(child, 'responderMove')(touchAt(13, 35));
    expect(fabric.commands.map(c => c.commandName)).toEqual(['hotspotUpdate']);
    expect(fabric.commands[0].args).toEqual([13, 35]);

    fabric.commands.length = 0;
    listenerOf(child, 'press')(touchAt(12, 34));
    listenerOf(child, 'pressOut')(touchAt(12, 34));
    expect(fabric.commands.map(c => c.commandName)).toEqual(['setPressed']);
    expect(fabric.commands[0].args).toEqual([false]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // :280 — `locationX ?? 0`. The bag is raw Fabric payload and a native host may omit either.
  it('defaults a missing hotspot coordinate to 0', () => {
    const { child } = mount({ onPress: () => {} });
    fabric.commands.length = 0;

    listenerOf(child, 'pressIn')({ nativeEvent: { pageX: 1, pageY: 1 } });
    expect(fabric.commands[0].args).toEqual([0, 0]);
  });
});
