// Co-located unit test: the @symbiote-native/components seam through the React bridge.
// el()/txt() build a Descriptor and descriptorToReact maps it to React elements. No native, no
// engine commit, this isolates the Descriptor -> element bridge every remaining render fn rides on.
// Lives in the adapter because descriptorToReact is the React half. Ported from the headless
// `descriptor-bridge.smoke.tsx`.
//
// It used to carry a `renderActivityIndicator` block too. That render fn is gone — the primitive is
// the `activity-indicator` TAG and the two nodes are built by its behavior — and every claim the
// block made (the named-size enum plus its fixed box, the iOS GRAY default, Android's null-colour
// omission and its two native extras) is now asserted on the COMMITTED payload in
// `core/components/src/behaviors/activity-indicator/activity-indicator.test.ts`, which is the
// stronger oracle.

import { describe, expect, it } from 'vitest';
import { el, txt } from '@symbiote-native/components';
import { descriptorToReact } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// React 19 types element.props as `unknown`; narrow a created element to its inspectable shape
// with a guard rather than a cast.
interface IReactish {
  type: unknown;
  key: unknown;
  props: Record<string, unknown>;
}

function inspect(node: unknown): IReactish {
  if (!isRecord(node) || !isRecord(node.props))
    throw new Error('not a react element');
  return { type: node.type, key: node.key, props: node.props };
}

describe('el() / txt()', () => {
  // Positive only: el()/txt() are pure descriptor builders with no validation branch — any
  // call produces a Descriptor, so there is no Negative group.
  describe('Positive', () => {
    const tree = el(
      'view',
      { style: { flex: 1 } },
      [txt({}, ['hi']), el('image', { source: 'x' })],
      'k',
    );

    // why: the Descriptor shape ({type, props, children, key}) is the CONTRACT every render fn
    // in @symbiote-native/components targets and every adapter bridge consumes — a field dropped
    // here breaks that contract for every framework at once, not just React.
    it('builds the descriptor shape with type, key and children', () => {
      expect(tree.type).toBe('view');
      expect(tree.key).toBe('k');
      expect(tree.children).toHaveLength(2);
    });

    // why: txt() is sugar over el('text', ...) — proves it produces the SAME element
    // type a hand-written el('text', ...) would, not a distinct text-node shape.
    it('makes txt() a text element', () => {
      const textChild = tree.children[0];
      expect(typeof textChild !== 'string' && textChild.type === 'text').toBe(
        true,
      );
    });
  });
});

describe('descriptorToReact', () => {
  // Positive only: the bridge is a total mapping over a well-formed Descriptor tree — no
  // rejecting branch, so no Negative group.
  describe('Positive', () => {
    const tree = el(
      'view',
      { style: { flex: 1 } },
      [txt({}, ['hi']), el('image', { source: 'x' })],
      'k',
    );
    const reactEl = inspect(descriptorToReact(tree));

    // why: this is the seam every render fn's output crosses to become a real React element —
    // type/key/props must survive verbatim, or every component built on a shared render fn
    // would silently lose its key (breaking React's reconciliation) or its props.
    it('maps type, key and props', () => {
      expect(reactEl.type).toBe('view');
      expect(reactEl.key).toBe('k');
      expect(reactEl.props.style).toEqual({ flex: 1 });
    });

    // why: the bridge must recurse — a Descriptor's children are themselves Descriptors (or raw
    // strings), and each must map to ITS OWN element type, not just the root.
    it('maps both children to their element types', () => {
      const kids = reactEl.props.children;
      expect(Array.isArray(kids)).toBe(true);
      if (!Array.isArray(kids)) throw new Error('children should be an array');
      expect(kids).toHaveLength(2);
      const textKid = inspect(kids[0]);
      const imageKid = inspect(kids[1]);
      expect(textKid.type).toBe('text');
      expect(imageKid.type).toBe('image');
      // the raw string 'hi' passes through as a child of the text element
      expect(textKid.props.children).toBe('hi');
    });
  });
});
