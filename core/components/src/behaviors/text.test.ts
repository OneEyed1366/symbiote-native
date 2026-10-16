// Нажимаемый `<Text>` как у RN (`Text.js` + `usePressability`): машина нажатия подключается, когда
// появляется `onPress` / `onLongPress` / `onStartShouldSetResponder`, и снимается вместе с ними
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  listenerFor,
  propOf,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { hasAttachedBehaviors } from '../../../engine/src/host-behavior';
import { registerTextBehavior, TEXT_TAG } from './text';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 6_000;

const TEXT_VIEW_NAME = 'RCTText';
const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function makeText(props: Record<string, unknown> = {}): ISymbioteNode {
  const node = createElement(TEXT_VIEW_NAME, true, TEXT_TAG);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return node;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = listenerFor(node, name);
  if (listener === undefined) throw new Error(`no "${name}" listener`);
  return listener;
}

beforeEach(() => {
  fabric.reset();
  registerTextBehavior();
});

afterEach(() => clearHostBehaviors());

describe('pressable text host behavior', () => {
  // Текст есть в каждом приложении: поведение на нём не должно взводить обход при сносе
  it('leaves a plain text without any behavior, so the teardown sweep stays off', () => {
    makeText({ style: { color: 'red' } });
    expect(hasAttachedBehaviors()).toBe(false);
    makeText({ onPress: vi.fn() });
    expect(hasAttachedBehaviors()).toBe(true);
  });

  it('keeps a press-in written before onPress', () => {
    const onPressIn = vi.fn();
    const node = makeText({ onPressIn, onPress: vi.fn() });
    listenerOf(node, 'pressIn')(TOUCH);
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  it('stays unarmed while nothing makes it pressable', () => {
    const node = makeText({ onPressIn: vi.fn() });
    expect(listenerFor(node, 'pressIn')).toBeUndefined();
    expect(listenerFor(node, 'startShouldSetResponder')).toBeUndefined();
  });

  it('arms on onPress and runs the press machine', () => {
    const onPress = vi.fn();
    const onPressIn = vi.fn();
    const node = makeText({ onPress, onPressIn });
    listenerOf(node, 'pressIn')(TOUCH);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(listenerOf(node, 'startShouldSetResponder')(TOUCH)).toBe(true);
  });

  it('arms on onLongPress and on onStartShouldSetResponder alone', () => {
    expect(
      listenerFor(makeText({ onLongPress: vi.fn() }), 'pressIn'),
    ).toBeDefined();
    expect(
      listenerFor(
        makeText({ onStartShouldSetResponder: () => true }),
        'pressIn',
      ),
    ).toBeDefined();
  });

  it('disarms when the last pressable listener goes away', () => {
    const node = makeText({ onPress: vi.fn() });
    expect(listenerFor(node, 'pressIn')).toBeDefined();
    routeProp(node, 'onPress', undefined);
    expect(listenerFor(node, 'pressIn')).toBeUndefined();
  });

  it('does not claim the responder while disabled', () => {
    const node = makeText({ onPress: vi.fn(), disabled: true });
    expect(listenerOf(node, 'startShouldSetResponder')(TOUCH)).toBeFalsy();
  });

  // Pressability держит `pressOut` до минимальной длительности нажатия, поэтому таймеры фальшивые
  it('highlights on press in and clears on press out (iOS)', () => {
    vi.useFakeTimers();
    try {
      const node = makeText({ onPress: vi.fn() });
      listenerOf(node, 'pressIn')(TOUCH);
      expect(propOf(node, 'isHighlighted')).toBe(true);
      listenerOf(node, 'pressOut')(TOUCH);
      vi.runAllTimers();
      expect(propOf(node, 'isHighlighted')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the highlight off with suppressHighlighting', () => {
    const node = makeText({ onPress: vi.fn(), suppressHighlighting: true });
    listenerOf(node, 'pressIn')(TOUCH);
    expect(propOf(node, 'isHighlighted') ?? false).toBe(false);
  });

  it('carries the highlight in the committed payload', () => {
    const node = makeText({ onPress: vi.fn() });
    listenerOf(node, 'pressIn')(TOUCH);
    expect(
      live.findLive(live.appRoot(), found => found.viewName === TEXT_VIEW_NAME)
        ?.payload.isHighlighted,
    ).toBe(true);
  });
});
