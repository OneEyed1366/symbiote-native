// Co-located unit test: the @symbiote-native/components seam through the React bridge.
// el()/txt() build a Descriptor, descriptorToReact maps it to React elements, and
// renderActivityIndicator emits the expected Descriptor (size enum + color omission). No native,
// no engine commit, this isolates the render-fn -> Descriptor -> element bridge every component
// rides on. Lives in the adapter because descriptorToReact is the React half. Ported from the
// headless `descriptor-bridge.smoke.tsx`.

import { describe, expect, it } from 'vitest';
import { el, txt, renderActivityIndicator } from '@symbiote-native/components';
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
      'symbiote-view',
      { style: { flex: 1 } },
      [txt({}, ['hi']), el('symbiote-image', { source: 'x' })],
      'k',
    );

    // why: the Descriptor shape ({type, props, children, key}) is the CONTRACT every render fn
    // in @symbiote-native/components targets and every adapter bridge consumes — a field dropped
    // here breaks that contract for every framework at once, not just React.
    it('builds the descriptor shape with type, key and children', () => {
      expect(tree.type).toBe('symbiote-view');
      expect(tree.key).toBe('k');
      expect(tree.children).toHaveLength(2);
    });

    // why: txt() is sugar over el('symbiote-text', ...) — proves it produces the SAME element
    // type a hand-written el('symbiote-text', ...) would, not a distinct text-node shape.
    it('makes txt() a symbiote-text element', () => {
      const textChild = tree.children[0];
      expect(
        typeof textChild !== 'string' && textChild.type === 'symbiote-text',
      ).toBe(true);
    });
  });
});

describe('descriptorToReact', () => {
  // Positive only: the bridge is a total mapping over a well-formed Descriptor tree — no
  // rejecting branch, so no Negative group.
  describe('Positive', () => {
    const tree = el(
      'symbiote-view',
      { style: { flex: 1 } },
      [txt({}, ['hi']), el('symbiote-image', { source: 'x' })],
      'k',
    );
    const reactEl = inspect(descriptorToReact(tree));

    // why: this is the seam every render fn's output crosses to become a real React element —
    // type/key/props must survive verbatim, or every component built on a shared render fn
    // would silently lose its key (breaking React's reconciliation) or its props.
    it('maps type, key and props', () => {
      expect(reactEl.type).toBe('symbiote-view');
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
      expect(textKid.type).toBe('symbiote-text');
      expect(imageKid.type).toBe('symbiote-image');
      // the raw string 'hi' passes through as a child of the text element
      expect(textKid.props.children).toBe('hi');
    });
  });
});

describe('renderActivityIndicator', () => {
  // Positive only: size/platform resolution is a total function over its input union ('small' |
  // 'large' | number) — no reject branch, so no Negative group.
  describe('Positive', () => {
    // why: RN maps the two NAMED sizes to a fixed pixel box (36x36 for 'large', RN's own
    // styles.sizeLarge) AND a native size enum; a numeric size instead sizes via style only,
    // with no enum sent. This proves the named-size branch produces BOTH outputs together, and
    // that a platform's own default color (iOS GRAY here) fills in when the caller passes none.
    it('maps a named size to its enum and keeps the iOS default color', () => {
      const ios = renderActivityIndicator(
        {
          animating: true,
          hidesWhenStopped: true,
          size: 'large',
          passthrough: { testID: 't' },
        },
        { defaultColor: '#999999', nativeExtras: {} },
      );
      expect(ios.type).toBe('symbiote-view');
      expect(ios.props.testID).toBe('t');

      const spinner = ios.children[0];
      expect(
        typeof spinner !== 'string' &&
          spinner.type === 'symbiote-activity-indicator',
      ).toBe(true);
      if (typeof spinner === 'string')
        throw new Error('spinner should be a descriptor');
      expect(spinner.props.size).toBe('large');
      expect(spinner.props.color).toBe('#999999');
      expect(spinner.props.style).toEqual({ width: 36, height: 36 });
    });

    // why: Android's theme default is `null`, and Fabric's color parser REJECTS a null color
    // prop outright — so `color` must be omitted entirely, not sent as null, while Android's
    // required styleAttr/indeterminate native extras still ride through untouched.
    it('omits a null platform color and forwards android nativeExtras', () => {
      const android = renderActivityIndicator(
        {
          animating: true,
          hidesWhenStopped: true,
          size: 'small',
          passthrough: {},
        },
        {
          defaultColor: null,
          nativeExtras: { styleAttr: 'Normal', indeterminate: true },
        },
      );
      const spinner = android.children[0];
      expect(typeof spinner).not.toBe('string');
      if (typeof spinner === 'string')
        throw new Error('spinner should be a descriptor');
      expect('color' in spinner.props).toBe(false);
      expect(spinner.props.indeterminate).toBe(true);
    });
  });
});
