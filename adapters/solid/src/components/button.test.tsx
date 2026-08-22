// Solid twin of adapters/react/src/components/button.test.ts and adapters/svelte's smoke.
//
// Coverage scope: the SOLID-SIDE half per <components_split_logic_view_lifecycle>. The colour fold
// and the role constant are shared (@symbiote-native/components' render-button) and are asserted
// only where the adapter has to ROUTE their output — onto the label rather than the touchable, and
// with `disabled` winning over `color`. What is genuinely Solid's: the single-bag composition (no
// mergeProps, so an override can be undefined), the split between the props Button consumes and
// the ones it forwards, and the lifecycle claim no other adapter can break — a prop read frozen at
// mount.
//
// Every assertion reads fabric.committed, and every lookup of the touchable goes through a testID:
// the creation log freezes props at first commit, and "the first RCTView" would match a wrapper
// (.claude/rules/test-harness-false-greens.md §2, §3).
//
// No Negative group: Button has no guard clause and no branch that throws.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Button } from './button';

const ROOT_TAG = 843;
const TEST_ID = 'primary-button';
const TITLE = 'Tap me';
// RN Button.js's iOS label look, owned by buttonTextStyle in @symbiote-native/components.
const DEFAULT_BLUE = '#007AFF';
const DISABLED_GREY = '#cdcdcd';
const LABEL_FONT_SIZE = 18;
const LABEL_PADDING = 8;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// TouchableOpacity fades through a real Animated.timing, and the engine's JS driver reads
// requestAnimationFrame off the HOST at call time — absent it, press-in throws before onPress can
// ever run. A setTimeout clock advancing 16ms a frame lets the animation finish without real time.
let frameClock = 0;
let nextFrameId = 1;
const pendingFrames = new Map<number, (time: number) => void>();

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frameClock += 16;
        frame(frameClock);
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  nextFrameId = 1;
  pendingFrames.clear();
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function committed(predicate: (node: IFakeNode) => boolean): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && predicate(node)) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

// The outer pressable — the node the responder and every forwarded native prop live on.
function touchable(): IFakeNode {
  return committed(node => node.props.testID === TEST_ID);
}

function label(): IFakeNode {
  return committed(node => node.viewName === 'RCTText');
}

describe('Solid Button on the engine', () => {
  describe('Positive', () => {
    // why: RN's Button is a TouchableOpacity wrapping a Text, and `title` is a STRING prop, not a
    // child — so the adapter has to build the label itself. The raw-text assertion is what proves
    // the title actually reaches Fabric rather than stopping at the Text component.
    it('renders the title as a Text label inside the touchable, in the shared base style', async () => {
      mount(ROOT_TAG, () => <Button testID={TEST_ID} title={TITLE} />);
      await tick();

      const labelProps = label().props;
      expect(labelProps.color).toBe(DEFAULT_BLUE);
      expect(labelProps.textAlign).toBe('center');
      expect(labelProps.fontSize).toBe(LABEL_FONT_SIZE);
      expect(labelProps.padding).toBe(LABEL_PADDING);
      expect(label().children[0].props.text).toBe(TITLE);
      // The label is nested UNDER the touchable, not a sibling — otherwise the tap target and the
      // visual would drift apart.
      expect(committed(node => node.props.testID === TEST_ID)).toBeDefined();
    });

    // why: `color` tints the LABEL on iOS (RN Button.js), never the touchable's background — a
    // colour landing on the wrong node paints a solid block instead of coloured text.
    it('tints the label with an explicit color and leaves the touchable uncoloured', async () => {
      mount(ROOT_TAG, () => (
        <Button testID={TEST_ID} title={TITLE} color="#ff0000" />
      ));
      await tick();

      expect(label().props.color).toBe('#ff0000');
      expect('color' in touchable().props).toBe(false);
    });

    // why: RN's fold makes `disabled` win over `color` — a disabled button must read as disabled
    // even when the caller tinted it, and getting the precedence backwards is invisible until a
    // designer notices a bright-red greyed-out button.
    it('greys the label when disabled, overriding an explicit color', async () => {
      mount(ROOT_TAG, () => (
        <Button testID={TEST_ID} title={TITLE} color="#ff0000" disabled />
      ));
      await tick();

      expect(label().props.color).toBe(DISABLED_GREY);
    });

    // why: RN's Button pins role=button / accessible=true / the disabled state AFTER the caller's
    // own props, so a caller cannot accidentally announce it as something else. This is the one
    // place the single-bag composition matters: with a spread-then-override on the tag, Solid's
    // mergeProps semantics change which side wins.
    it('pins the button role, accessible and the disabled state over the caller values', async () => {
      mount(ROOT_TAG, () => (
        <Button
          testID={TEST_ID}
          title={TITLE}
          disabled
          accessibilityRole="link"
          accessible={false}
          accessibilityState={{ busy: true }}
        />
      ));
      await tick();

      const props = touchable().props;
      expect(props.accessibilityRole).toBe('button');
      expect(props.accessible).toBe(true);
      expect(props.accessibilityState).toEqual({ disabled: true });
    });

    // why: touchSoundDisabled is Button's own spelling of the pressable's android_disableSound —
    // it is RE-MAPPED, not forwarded, so a missed rename silently leaves the tap sound on and the
    // unknown prop riding to Fabric.
    it('re-maps touchSoundDisabled onto the pressable android_disableSound', async () => {
      mount(ROOT_TAG, () => (
        <Button testID={TEST_ID} title={TITLE} touchSoundDisabled />
      ));
      await tick();

      const props = touchable().props;
      expect(props.android_disableSound).toBe(true);
      expect('touchSoundDisabled' in props).toBe(false);
    });

    // why: the TV-focus props are real Fabric props the touchable does not TYPE — they ride the
    // spread untyped, so nothing but a committed-tree assertion can show they still arrive. `title`
    // is the counter-check: it is consumed here and must never reach the native view.
    it('forwards the TV-focus props to the native view and keeps `title` off it', async () => {
      const NEXT_FOCUS_TAG = 42;
      mount(ROOT_TAG, () => (
        <Button
          testID={TEST_ID}
          title={TITLE}
          hasTVPreferredFocus
          nextFocusDown={NEXT_FOCUS_TAG}
        />
      ));
      await tick();

      const props = touchable().props;
      expect(props.hasTVPreferredFocus).toBe(true);
      expect(props.nextFocusDown).toBe(NEXT_FOCUS_TAG);
      expect('title' in props).toBe(false);
    });

    // why: onPress is the whole point of the component and it is forwarded, not synthesized — it
    // has to survive the split between the props Button consumes and the bag it hands on.
    it('fires onPress from a real touch on the native view', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <Button
          testID={TEST_ID}
          title={TITLE}
          onPress={() => {
            presses++;
          }}
        />
      ));
      await tick();

      const created = fabric.find(node => node.props.testID === TEST_ID);
      if (created === undefined) throw new Error('no touchable was created');
      fabric.fireEvent(created.instanceHandle, 'topTouchStart');
      await tick();
      fabric.fireEvent(created.instanceHandle, 'topTouchEnd');
      await tick();

      expect(presses).toBe(1);
    });

    // why: Solid runs a component body ONCE. `color` and `disabled` are read inside a memo the
    // label's style accessor re-runs, so a later change repaints the SAME text node; a destructure
    // at setup would freeze the label while every other test here passed. The identity assertion is
    // the other half — rebuilding the label mid-gesture is what costs the responder grant
    // (.claude/rules/solid-descriptor-bridge.md §4).
    it('repaints the same label node when the color changes after mount', async () => {
      const [color, setColor] = createSignal('#ff0000');
      mount(ROOT_TAG, () => (
        <Button testID={TEST_ID} title={TITLE} color={color()} />
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(label().props.color).toBe('#ff0000');

      setColor('#00ff00');
      await tick();

      expect(label().props.color).toBe('#00ff00');
      expect(fabric.counts.createNode, 'the label node kept its identity').toBe(
        createdAtMount,
      );
    });
  });
});
