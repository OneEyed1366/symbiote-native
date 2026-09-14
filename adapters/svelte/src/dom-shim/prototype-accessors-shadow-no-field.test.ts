// No canonical prop accessor may cover an INSTANCE FIELD of the shim node classes.
//
// WHY THIS CANNOT BE A BEHAVIOUR TEST. The two transforms disagree about what `x = init` in a
// class body means, and only one of them is fatal:
//
//   vitest / esbuild   useDefineForClassFields -> defineProperty(this, 'children', …)
//                      the own property SHADOWS the prototype accessor. Everything works.
//   Metro / babel      loose class fields      -> this.children = []
//                      the prototype SETTER swallows it. `this.children` then reads the getter,
//                      `this.p.children`, i.e. undefined.
//
// So the defect is invisible to every mount-and-assert test in this suite — all 328 passed while
// `examples/svelte` crashed on its ROOT node at `makeLive`, iterating a `children` that was
// undefined (`Uncaught Error: Cannot convert undefined value to object`, shim-node.ts's
// `for (const child of this.children)`). Asserting the SHAPE is the only form that transfers.
//
// `children` is the live case: it is both a canonical prop name (every `I*Props` with a
// `children: Snippet`) and ShimNode's own field — the tree structure itself.
import { describe, expect, it } from 'vitest';
import { CANONICAL_PROP_NAMES } from './canonical-prop-names';
import { ShimElement } from './element';

describe('a canonical prop accessor never shadows an instance field', () => {
  it('installs no accessor over a name the instance owns', () => {
    const element = new ShimElement('view');
    const shadowed = CANONICAL_PROP_NAMES.filter(
      name =>
        Object.hasOwn(element, name) &&
        Object.getOwnPropertyDescriptor(ShimElement.prototype, name)?.get !==
          undefined,
    );
    expect(
      shadowed,
      'a prototype accessor over one of these is swallowed by Metro loose class fields',
    ).toEqual([]);
  });

  // The control. The assertion above is "a filtered list is empty", which an empty
  // CANONICAL_PROP_NAMES or an instance with no own fields would satisfy for the wrong reason.
  it('reads a real name set and a real instance shape', () => {
    const element = new ShimElement('view');
    expect(CANONICAL_PROP_NAMES.length).toBeGreaterThan(100);
    expect(CANONICAL_PROP_NAMES).toContain('children');
    expect(Object.hasOwn(element, 'children')).toBe(true);
    expect(Object.getOwnPropertyNames(element).length).toBeGreaterThan(4);
    // The accessor loop ran at all: a name the instance does NOT own did get one.
    expect(
      Object.getOwnPropertyDescriptor(ShimElement.prototype, 'testID')?.get,
    ).toBeTypeOf('function');
  });

  // `children` specifically: the accessor loop must have left ShimNode's field alone, so pushing
  // through the tree API is what a read sees — not the prop bag.
  it('keeps children the tree, not a prop-bag entry', () => {
    const parent = new ShimElement('view');
    const child = new ShimElement('text');
    parent.appendChild(child);
    expect(parent.children).toEqual([child]);
    expect(parent.p.children).toBeUndefined();
  });
});
