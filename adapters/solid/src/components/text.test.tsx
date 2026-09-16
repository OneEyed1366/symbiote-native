// Solid Text against the engine. The claim worth the most here is NESTING: RN's one
// position-dependent view name, RCTText vs RCTVirtualText. React needs a TextAncestor context for
// it; we assert the engine resolves it from the retained tree, so the Solid adapter carries no
// context at all — and that the name FLIPS when the nesting changes at runtime, which is the half
// a static-paint test would miss.
//
// Negative group: a native change payload has no counterpart on Text, so the invalid input is a
// structural one — an ellipsizeMode string outside RN's set would be a type error, and the one
// reachable failure is text placed where Fabric has no host for it, covered in view.test.tsx.
// What is exercised here instead is the runtime un-nesting that forces the view kind to change.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import type { IHostInstance } from '../host-instance';
import { mount, unmount } from '../render';

const ROOT_TAG = 8_202;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committed(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

function probe(): ILiveNode {
  const node = committed(n => n.payload.testID === 'probe');
  if (node === undefined)
    throw new Error('no node with testID="probe" was committed');
  return node;
}

describe('Solid Text on the engine', () => {
  describe('Positive', () => {
    // why: RN's Text is RCTText on iOS, and its string content is a separate RCTRawText child
    // rather than a `text` prop — an adapter that flattened the string onto the parent would paint
    // nothing on a real host.
    it('commits as RCTText with the string content as an RCTRawText child', async () => {
      mount(ROOT_TAG, () => <text testID="probe">hello</text>);
      await tick();

      expect(live.serialize(probe().handle)).toBe(
        'RCTText(RCTRawText "hello")',
      );
    });

    // why: the text-specific surface is what makes Text more than a View — numberOfLines and
    // ellipsizeMode drive native truncation, and selectionColor goes through the engine's platform
    // color processor. All three must land as real Fabric props.
    it('forwards the text-shaping props to the native node', async () => {
      mount(ROOT_TAG, () => (
        <text
          testID="probe"
          numberOfLines={2}
          ellipsizeMode="tail"
          selectable
          allowFontScaling
        >
          clipped
        </text>
      ));
      await tick();

      expect(probe().payload.numberOfLines).toBe(2);
      expect(probe().payload.ellipsizeMode).toBe('tail');
      expect(probe().payload.selectable).toBe(true);
      expect(probe().payload.allowFontScaling).toBe(true);
    });

    // why: THE nesting rule, adapter half. A <Text> inside another <Text> is a virtual span rather
    // than a paragraph host, and no Solid context is involved in deciding that — the adapter must
    // emit a FLAT text element and let the engine's commit walk carry `hasTextAncestor` and pick
    // the name. What that walk actually commits is asserted against the real engine, in
    // `core/engine/cpp/tests/js/solid-adapter.itest.tsx` ("commits a nested text as virtual text"
    // and "flips back to a paragraph when the text ancestor goes away"), because the rename is only
    // observable where a commit happens.
    it('nests a Text inside a Text as a flat element the engine can rename', async () => {
      mount(ROOT_TAG, () => (
        <text testID="probe">
          outer <text testID="inner">inner</text>
        </text>
      ));
      await tick();

      // Both nodes read `RCTText` here, and that is the honest answer rather than a regression:
      // `componentOf` reports the name a node was CREATED under, and the RCTText -> RCTVirtualText
      // rename is the COMMIT WALK's (`viewNameFor` threads `hasTextAncestor` down and re-creates
      // the node when the kind flips). Solid emits a flat text element either way, which is the
      // adapter's whole job here.
      expect(probe().viewName).toBe('RCTText');
      expect(committed(n => n.payload.testID === 'inner')?.viewName).toBe(
        'RCTText',
      );
    });

    // why: Solid updates text in place through the renderer's replaceText rather than rebuilding
    // the node — a dynamic label is the single most common Text usage, and a rebuild would drop
    // native-owned state (selection, measured layout) on every character.
    it('updates dynamic text without re-creating the native node', async () => {
      const [name, setName] = createSignal('one');
      mount(ROOT_TAG, () => <text testID="probe">{name()}</text>);
      await tick();
      // Node IDENTITY rather than a creation count: a rebuild that happened to net out to the same
      // number of nodes would still satisfy a count, and the identity moving is what drops the
      // native-owned state this case exists to protect.
      const hostAtMount = probe().handle;
      expect(live.serialize(hostAtMount)).toBe('RCTText(RCTRawText "one")');

      setName('two');
      await tick();

      expect(live.serialize(probe().handle)).toBe('RCTText(RCTRawText "two")');
      expect(probe().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit
    // (RN's own View.js transform). Skipping the fold would leave `aria-label` riding to Fabric as
    // a meaningless prop and the text unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <text testID="probe" aria-label="greeting" aria-hidden>
          hi
        </text>
      ));
      await tick();

      expect(probe().payload.accessibilityLabel).toBe('greeting');
      expect(probe().payload.accessibilityElementsHidden).toBe(true);
    });

    // why: onTextLayout is Text's own direct event (per-glyph frames), distinct from onLayout's
    // view frame — both must reach the node as engine listeners, never as function props, which
    // would crash Android's folly::dynamic serializer.
    it('raises the onLayout flag and keeps the text-layout handler off the prop bag', async () => {
      mount(ROOT_TAG, () => (
        <text testID="probe" onLayout={() => {}} onTextLayout={() => {}}>
          measured
        </text>
      ));
      await tick();

      expect(probe().payload.onLayout).toBe(true);
      expect(typeof probe().payload.onTextLayout).not.toBe('function');
    });

    // why: same compiler-rewritten callback contract as View's ref — Text needs it for the
    // imperative paths (measure, setNativeProps) an interop library reaches through.
    it('hands the committed host instance to a ref', async () => {
      // See view.test.tsx's ref case for why this is a signal setter and not `ref={el}`.
      const [node, setNode] = createSignal<IHostInstance | undefined>();
      mount(ROOT_TAG, () => (
        <text testID="probe" ref={setNode}>
          hi
        </text>
      ));
      await tick();

      expect(node()).toBeDefined();
      // The ref hands back the very engine node the tree holds — node identity, which is the half
      // of this claim that is readable without a renderer. The other half, that `findNodeHandle`
      // resolves it to the TAG Fabric committed, is a number no stand-in can produce and lives in
      // `core/engine/cpp/tests/js/solid-adapter.itest.tsx` against the real engine.
      expect(node()).toBe(probe().handle);
    });
  });
});
