// Структура `checkbox` и переключение по нажатию, вид проверяет `checkbox-payload.itest.ts`
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  listenerFor,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerCheckboxBehavior, CHECKBOX_TAG } from './checkbox';
import { CHECKMARK_URI } from './checkbox-checkmark';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 7600;

const TEST_ID = 'subject';
const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function makeCheckbox(props: Record<string, unknown> = {}): ISymbioteNode {
  const node = createElement('RCTView', false, CHECKBOX_TAG);
  routeProp(node, 'testID', TEST_ID);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  return node;
}

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function committedHost(): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === TEST_ID,
  );
  if (hit === undefined) throw new Error('checkbox did not commit');
  return hit;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = listenerFor(node, name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener, the behavior did not attach`);
  return listener;
}

// Жест целиком: `pressOut` сбрасывает флаг сборки машины, иначе новый `disabled` не виден
async function tap(node: ISymbioteNode): Promise<void> {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
  listenerOf(node, 'press')(TOUCH);
  listenerOf(node, 'pressOut')(TOUCH);
  await vi.advanceTimersByTimeAsync(400);
}

beforeEach(() => {
  fabric.reset();
  vi.useFakeTimers();
  registerCheckboxBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('checkbox host behavior', () => {
  describe('Positive', () => {
    it('commits one box with the checkmark image under it', async () => {
      mount(makeCheckbox({ value: true }));
      await vi.advanceTimersByTimeAsync(0);

      const host = committedHost();
      expect(host.viewName).toBe('RCTView');
      expect(host.children).toHaveLength(1);
      expect(host.children[0].viewName).toBe('RCTImageView');
      // Массив, как у любого Image: Android кастует `source` в ReadableArray, объект там падает
      expect(host.children[0].payload.source).toEqual([{ uri: CHECKMARK_URI }]);
    });

    it('keeps the checkmark node at value false, the C++ rule hides it', async () => {
      mount(makeCheckbox({ value: false }));
      await vi.advanceTimersByTimeAsync(0);

      expect(committedHost().children).toHaveLength(1);
    });

    it('reports the inverted value when an unchecked box is pressed', async () => {
      const onValueChange = vi.fn();
      const node = makeCheckbox({ value: false, onValueChange });
      mount(node);
      await tap(node);

      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: true }),
      );
    });

    it('reports the inverted value when a checked box is pressed', async () => {
      const onValueChange = vi.fn();
      const node = makeCheckbox({ value: true, onValueChange });
      mount(node);
      await tap(node);

      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: false }),
      );
    });

    it('inverts the value of the latest render, not the mounted one', async () => {
      const onValueChange = vi.fn();
      const node = makeCheckbox({ value: false, onValueChange });
      const surface = mount(node);
      routeProp(node, 'value', true);
      surface.commit();
      await tap(node);

      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: false }),
      );
    });

    it('calls the latest onValueChange after a re-render', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const node = makeCheckbox({ value: false, onValueChange: first });
      const surface = mount(node);
      routeProp(node, 'onValueChange', second);
      surface.commit();
      await tap(node);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: true }),
      );
    });

    it('ignores an authored onPress, the toggle replaces it like upstream', async () => {
      const onPress = vi.fn();
      const onValueChange = vi.fn();
      const node = makeCheckbox({ value: false, onPress, onValueChange });
      mount(node);
      await tap(node);

      expect(onPress).not.toHaveBeenCalled();
      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: true }),
      );
    });

    it('does not throw on a press without onValueChange', async () => {
      const node = makeCheckbox({ value: false });
      mount(node);

      await expect(tap(node)).resolves.toBeUndefined();
    });
  });

  // Disabled блокирует нажатие, ошибки нет: `onValueChange` просто не зовётся
  describe('denies', () => {
    it('does not report a change while disabled', async () => {
      const onValueChange = vi.fn();
      const node = makeCheckbox({
        value: false,
        disabled: true,
        onValueChange,
      });
      mount(node);
      await tap(node);

      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('reports again once it is re-enabled', async () => {
      const onValueChange = vi.fn();
      const node = makeCheckbox({
        value: false,
        disabled: true,
        onValueChange,
      });
      const surface = mount(node);
      await tap(node);
      routeProp(node, 'disabled', false);
      surface.commit();
      await tap(node);

      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ value: true }),
      );
    });
  });
});
