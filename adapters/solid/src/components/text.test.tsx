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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { findNodeHandle } from '../host-instance';
import type { IHostInstance } from '../host-instance';
import { mount, unmount } from '../render';
import { Text } from './text';
import { View } from './view';

const ROOT_TAG = 8_202;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committed(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

function probe(): IFakeNode {
  const node = committed(n => n.props.testID === 'probe');
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
      mount(ROOT_TAG, () => <Text testID="probe">hello</Text>);
      await tick();

      expect(fabric.serialize([probe()])).toBe('RCTText(RCTRawText "hello")');
    });

    // why: the text-specific surface is what makes Text more than a View — numberOfLines and
    // ellipsizeMode drive native truncation, and selectionColor goes through the engine's platform
    // color processor. All three must land as real Fabric props.
    it('forwards the text-shaping props to the native node', async () => {
      mount(ROOT_TAG, () => (
        <Text
          testID="probe"
          numberOfLines={2}
          ellipsizeMode="tail"
          selectable
          allowFontScaling
        >
          clipped
        </Text>
      ));
      await tick();

      expect(probe().props.numberOfLines).toBe(2);
      expect(probe().props.ellipsizeMode).toBe('tail');
      expect(probe().props.selectable).toBe(true);
      expect(probe().props.allowFontScaling).toBe(true);
    });

    // why: THE nesting rule. A <Text> inside another <Text> is a virtual span, not a paragraph
    // host, and getting it wrong means the inner text either does not paint or breaks the outer
    // one's line layout. No Solid context is involved: the engine's commit walk carries the
    // hasTextAncestor flag and picks the name.
    it('renders a nested Text as RCTVirtualText and an unnested one as RCTText', async () => {
      mount(ROOT_TAG, () => (
        <Text testID="probe">
          outer <Text testID="inner">inner</Text>
        </Text>
      ));
      await tick();

      expect(probe().viewName).toBe('RCTText');
      expect(committed(n => n.props.testID === 'inner')?.viewName).toBe(
        'RCTVirtualText',
      );
    });

    // why: the view kind is position-dependent, so it must be re-resolved when the position
    // changes at runtime — not read once at mount. A Text that moves out from under a Text
    // ancestor has to become a real RCTText, which the engine does by re-creating the node.
    it('flips a Text back to RCTText when it stops having a Text ancestor', async () => {
      const [nested, setNested] = createSignal(true);
      mount(ROOT_TAG, () => (
        <View>
          {nested() ? (
            <Text>
              outer <Text testID="probe">moving</Text>
            </Text>
          ) : (
            <Text testID="probe">moving</Text>
          )}
        </View>
      ));
      await tick();
      expect(probe().viewName).toBe('RCTVirtualText');

      setNested(false);
      await tick();

      expect(probe().viewName).toBe('RCTText');
    });

    // why: Solid updates text in place through the renderer's replaceText rather than rebuilding
    // the node — a dynamic label is the single most common Text usage, and a rebuild would drop
    // native-owned state (selection, measured layout) on every character.
    it('updates dynamic text without re-creating the native node', async () => {
      const [name, setName] = createSignal('one');
      mount(ROOT_TAG, () => <Text testID="probe">{name()}</Text>);
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(fabric.serialize([probe()])).toBe('RCTText(RCTRawText "one")');

      setName('two');
      await tick();

      expect(fabric.serialize([probe()])).toBe('RCTText(RCTRawText "two")');
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit
    // (RN's own View.js transform). Skipping the fold would leave `aria-label` riding to Fabric as
    // a meaningless prop and the text unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <Text testID="probe" aria-label="greeting" aria-hidden>
          hi
        </Text>
      ));
      await tick();

      expect(probe().props.accessibilityLabel).toBe('greeting');
      expect(probe().props.accessibilityElementsHidden).toBe(true);
    });

    // why: onTextLayout is Text's own direct event (per-glyph frames), distinct from onLayout's
    // view frame — both must reach the node as engine listeners, never as function props, which
    // would crash Android's folly::dynamic serializer.
    it('raises the onLayout flag and keeps the text-layout handler off the prop bag', async () => {
      mount(ROOT_TAG, () => (
        <Text testID="probe" onLayout={() => {}} onTextLayout={() => {}}>
          measured
        </Text>
      ));
      await tick();

      expect(probe().props.onLayout).toBe(true);
      expect(typeof probe().props.onTextLayout).not.toBe('function');
    });

    // why: same compiler-rewritten callback contract as View's ref — Text needs it for the
    // imperative paths (measure, setNativeProps) an interop library reaches through.
    it('hands the committed host instance to a ref', async () => {
      // See view.test.tsx's ref case for why this is a signal setter and not `ref={el}`.
      const [node, setNode] = createSignal<IHostInstance | undefined>();
      mount(ROOT_TAG, () => (
        <Text testID="probe" ref={setNode}>
          hi
        </Text>
      ));
      await tick();

      expect(node()).toBeDefined();
      expect(findNodeHandle(node)).toBe(probe().tag);
    });
  });
});
