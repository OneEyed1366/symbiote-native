// `button` as a TAG, through Solid's own renderer — the suite that was `components/button.test.tsx`
// while a wrapper existed. RN's Button takes no children (`title` is a string prop, Button.js:363)
// and builds a touchable > view > text subtree itself, so the wrapper had nothing left to do once
// `core/components/src/behaviors/button.ts` built the same thing on the engine node.
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike TouchableNativeFeedback's, whose tag
// commits nothing either way. An unregistered `button` commits ONE bare view with no children, so
// the subtree assertion below fails on the registration alone.
//
// Coverage scope is unchanged: the folds are shared (@symbiote-native/components' render-button)
// and are asserted where the ROUTING decides — onto the label rather than the host, `disabled`
// winning over `color` — plus the one claim only Solid can break, a prop read frozen at mount.
//
// Every assertion reads fabric.committed, and every lookup of the host goes through a testID: the
// creation log freezes props at first commit, and "the first RCTView" would match a container
// (.claude/rules/test-harness-false-greens.md §2, §3).
//
// No Negative group: the tag has no guard clause and no branch that throws.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the behavior is what builds the subtree. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 843;
const TEST_ID = 'primary-button';
const TITLE = 'Tap me';
// RN Button.js's iOS label look, owned by buttonTextStyle in @symbiote-native/components.
const DEFAULT_BLUE = '#007AFF';
const DISABLED_GREY = '#cdcdcd';
const LABEL_FONT_SIZE = 18;
// MARGIN, not padding. This read `padding` until 2026-09-09 and pinned a divergence: RN spells it
// `margin: 8` (Button.js:409), so the label pushes the button's edges outward instead of insetting
// itself — a different tap target and, on Android, a different background size.
const LABEL_MARGIN = 8;

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

describe('Solid: `button` as a tag', () => {
  describe('Positive', () => {
    // why: RN's Button is a TouchableOpacity wrapping a View wrapping a Text, and `title` is a
    // STRING prop, not a child — so the whole subtree is the behavior's. The raw-text assertion is
    // what proves the title reaches Fabric through the `title` -> `text` slot redirect.
    it('renders the title as a Text label inside the touchable, in the shared base style', async () => {
      mount(ROOT_TAG, () => <button testID={TEST_ID} title={TITLE} />);
      await tick();

      const labelProps = label().props;
      expect(labelProps.color).toBe(DEFAULT_BLUE);
      expect(labelProps.textAlign).toBe('center');
      expect(labelProps.fontSize).toBe(LABEL_FONT_SIZE);
      expect(labelProps.margin).toBe(LABEL_MARGIN);
      expect(label().children[0].props.text).toBe(TITLE);
      // RN's FOUR nodes on iOS, in order and by view name — the host (TouchableOpacity's own
      // Animated.View, which the tag IS), the inner view carrying the Material look on Android and
      // nothing here, the Text, and the raw text. Three of them exist only because the behavior
      // built them, so this is also what fails if `./register` is dropped: an unregistered tag
      // commits the host alone, with no children at all.
      //
      // Android commits THREE — TouchableNativeFeedback renders no view of its own, so the inner
      // view IS the host (Button.js:281-284). Asserted in
      // `core/components/src/behaviors/button-android.test.ts`, which is the only place with a
      // Platform mock; the branch is the behavior's, not this adapter's.
      const [innerView] = touchable().children;
      expect(touchable().children).toHaveLength(1);
      expect(innerView.viewName).toBe('RCTView');
      expect(innerView.children[0].viewName).toBe('RCTText');
      expect(innerView.children[0].children[0].viewName).toBe('RCTRawText');
    });

    // why: `color` tints the LABEL on iOS (RN Button.js), never the touchable's background — a
    // colour landing on the wrong node paints a solid block instead of coloured text.
    it('tints the label with an explicit color and leaves the touchable uncoloured', async () => {
      mount(ROOT_TAG, () => (
        <button testID={TEST_ID} title={TITLE} color="#ff0000" />
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
        <button testID={TEST_ID} title={TITLE} color="#ff0000" disabled />
      ));
      await tick();

      expect(label().props.color).toBe(DISABLED_GREY);
    });

    // why: RN's Button pins role=button and the disabled state AFTER the caller's own props, so a
    // caller cannot accidentally announce it as something else. This is the one place the
    // single-bag composition matters: with a spread-then-override on the tag, Solid's mergeProps
    // semantics change which side wins.
    //
    // `accessible` and the rest of `accessibilityState` are the two this file used to get WRONG,
    // and it asserted the divergence rather than catching it. RN passes `accessible` through and
    // lets TouchableOpacity default it (`accessible !== false`, TouchableOpacity.js:303), so an
    // explicit `false` survives; and it MERGES the state, keeping busy/checked/expanded/selected
    // and overriding only `disabled` (Button.js:333-338).
    it('pins the button role and the disabled state, and passes the rest through', async () => {
      mount(ROOT_TAG, () => (
        <button
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
      expect(props.accessible).toBe(false);
      expect(props.accessibilityState).toEqual({ busy: true, disabled: true });
    });

    // why: touchSoundDisabled is Button's own spelling of the pressable's android_disableSound —
    // it is RE-MAPPED, not forwarded, so a missed rename silently leaves the tap sound on and the
    // unknown prop riding to Fabric.
    it('re-maps touchSoundDisabled onto the pressable android_disableSound', async () => {
      mount(ROOT_TAG, () => (
        <button testID={TEST_ID} title={TITLE} touchSoundDisabled />
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
        <button
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

    // why: onPress reaches the app through the responder path, not through the behavior. This is
    // the ONE arm here that survives dropping `registerButtonBehavior()` — `press` is a responder
    // event, so `routeProp` installs the app's callback in the listener slot directly and a plain
    // tap dispatches with no machine at all. It measures the engine's responder wiring; every other
    // arm in this file is the registration oracle.
    it('fires onPress from a real touch on the native view', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <button
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
        <button testID={TEST_ID} title={TITLE} color={color()} />
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
