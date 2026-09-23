// Pressable's android_ripple, the command half — useAndroidRippleForView.js:77-104: the ripple
// only animates if JS drives the view's pressed state, because the JS responder consumes the touch
// before Android's own pressed handling runs. Its own file because `Platform.OS` is read at load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installRecordingFabric } from '../../../test-utils/src/index';

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

const { clearHostBehaviors, createElement, createSurface, routeProp } =
  await import('@symbiote-native/engine');
type IListener = import('@symbiote-native/engine').IListener;
type ISymbioteEvent = import('@symbiote-native/engine').ISymbioteEvent;
type ISymbioteNode = import('@symbiote-native/engine').ISymbioteNode;
const { descriptorFor } = await import('../component-names');
const { registerPressableBehavior } = await import('./pressable');

const fabric = installRecordingFabric();
let nextRootTag = 7800;

function touchAt(x: number, y: number): ISymbioteEvent {
  return { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y } };
}

function mount(props: Readonly<Record<string, unknown>>): ISymbioteNode {
  const descriptor = descriptorFor('pressable');
  const node = createElement(
    descriptor.component,
    descriptor.isText,
    'pressable',
  );
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return node;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

function press(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(touchAt(12, 34));
  listenerOf(node, 'startShouldSetResponder')(touchAt(12, 34));
  listenerOf(node, 'responderMove')(touchAt(13, 35));
  listenerOf(node, 'press')(touchAt(13, 35));
  listenerOf(node, 'pressOut')(touchAt(13, 35));
  vi.runAllTimers();
}

beforeEach(() => {
  vi.useFakeTimers();
  fabric.commands.length = 0;
  registerPressableBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('pressable android_ripple on Android (Positive — no throwing path)', () => {
  // why: hotspot then pressed on pressIn, hotspot on move, unpressed on pressOut — RN's order.
  it('drives the ripple with hotspotUpdate and setPressed', () => {
    const node = mount({
      onPress: () => {},
      android_ripple: { color: '#ff0000' },
    });
    fabric.commands.length = 0;

    press(node);

    expect(fabric.commands.map(c => [c.commandName, c.args])).toEqual([
      ['hotspotUpdate', [12, 34]],
      ['setPressed', [true]],
      ['hotspotUpdate', [13, 35]],
      ['setPressed', [false]],
    ]);
  });
});

describe('pressable android_ripple on Android (sends no command)', () => {
  // why: RN builds no ripple (and no handlers) unless color, borderless or radius is set.
  it('sends nothing for a ripple config without color, borderless or radius', () => {
    const node = mount({
      onPress: () => {},
      android_ripple: { foreground: true },
    });
    fabric.commands.length = 0;

    press(node);

    expect(fabric.commands).toEqual([]);
  });

  // why: no android_ripple, no ripple — a plain Pressable dispatches no view command.
  it('sends nothing without android_ripple', () => {
    const node = mount({ onPress: () => {} });
    fabric.commands.length = 0;

    press(node);

    expect(fabric.commands).toEqual([]);
  });
});
