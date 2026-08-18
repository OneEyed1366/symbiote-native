// The framework-agnostic node a render function paints. A `Descriptor` is a tiny VDOM
// description, `{ type, props, children, key }`, that each adapter maps to its own
// element (`descriptorToReact` → React.createElement, `descriptorToVue` → h()). The
// adapter's host element then flows on through its reconciler → engine → Fabric.
//
// `type` is an open host-component string, not a closed two-member union, because
// symbiote paints one host element PER native component (`symbiote-activity-indicator`,
// `symbiote-switch`, …), not just a generic box/text pair.

// The host component to paint. The three primitives (`symbiote-view` / `symbiote-text` /
// `symbiote-image`) plus any native leaf a component emits, kept open as a string since
// components register their own host element names with the engine.
export type IDescriptorType = string;

// Open prop bag, like an RN host element's props: style, events, accessibility, native
// props all live here. The adapter bridge forwards it onto the framework element verbatim.
export type IDescriptorProps = Record<string, unknown>;

export type IDescriptorChild = IDescriptor | string;

export type IDescriptor = {
  type: IDescriptorType;
  props: IDescriptorProps;
  children: IDescriptorChild[];
  key?: string;
};

// el(): a host element of any type. txt(): shorthand for the `symbiote-text` primitive.
export function el(
  type: IDescriptorType,
  props: IDescriptorProps = {},
  children: IDescriptorChild[] = [],
  key?: string,
): IDescriptor {
  return { type, props, children, key };
}

export function txt(
  props: IDescriptorProps = {},
  children: IDescriptorChild[] = [],
): IDescriptor {
  return { type: 'symbiote-text', props, children };
}

// The shape-stability contract, enforced next to the type it guards.
//
// A `render-*.ts` fn must produce a Descriptor of CONSTANT shape across calls — same `type`, same
// child count, text where text was — with only prop VALUES varying. React and Vue never need this
// stated, because their own reconcilers diff whatever they are handed. An adapter with
// fine-grained reactivity has no such reconciler: it builds the tree ONCE and updates props on the
// live nodes in place, which is sound only while the shape holds. A violation has to fail loudly —
// silently re-propping the wrong node surfaces much later as a mispainted screen.
//
// This lives here because the invariant is the PRODUCER's, not each consumer's. Svelte's and
// Solid's bridges each grew their own copy of these predicates and had already drifted apart
// (Solid's missed both a changed `type` and a grown child list). One owner, one message, so the
// next fine-grained adapter inherits the whole check instead of writing a third partial version.
export type IDescriptorShapeGuard = {
  error(detail: string): Error;
  assertType(expected: IDescriptorType, actual: IDescriptorType): void;
  assertChildCount(expected: number, actual: number): void;
  asText(child: IDescriptorChild): string;
  asElement(child: IDescriptorChild): IDescriptor;
};

// `bridge` names the caller (`descriptorToSolid`, `descriptorToSvelte`) so a device log says which
// one tripped without a stack to read.
export function createDescriptorShapeGuard(
  bridge: string,
): IDescriptorShapeGuard {
  const error = (detail: string): Error =>
    new Error(
      `${bridge}: Descriptor shape changed between renders (${detail}) — a render-*.ts fn must ` +
        `produce a CONSTANT tree shape; only prop values may vary between calls.`,
    );

  return {
    error,
    assertType(expected, actual) {
      if (expected !== actual) throw error(`${expected} -> ${actual}`);
    },
    assertChildCount(expected, actual) {
      if (expected !== actual)
        throw error(`child count ${expected} -> ${actual}`);
    },
    asText(child) {
      if (typeof child !== 'string') throw error(`text -> ${child.type}`);
      return child;
    },
    asElement(child) {
      if (typeof child === 'string') throw error('element -> text');
      return child;
    },
  };
}
