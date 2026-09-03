// `IHostBehavior.buildStructure` + `ISymbioteNode.childHost` — the seam that lets a COMPOSED
// primitive be a host element. `foldPayload` gave a lowered primitive its wrapper's prop mapping;
// this gives it the wrapper's internal subtree, which is what a ScrollView (scroll view wrapping a
// content view) or an ImageBackground needs and what nothing before this could express.
//
// The assertions worth their lines are the ones that are green either way if you only test the
// happy append: `removeChild` through the owner (an un-redirected remove is a SILENT no-op — the
// splice misses, the child stays committed, and the framework believes it is gone), and the
// park/unpark case (rebuilding on re-attach duplicates the structure and swaps the slot's identity
// out from under app children that still point at the old one).
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  insertBefore,
  registerHostBehavior,
  removeChild,
  type ISymbioteNode,
} from './index';

const fabric = installFabric();
let nextRootTag = 9500;

// Distinct Fabric names throughout, so an assertion can never pass by matching the wrong node —
// the trap the neighbouring host-behavior suite records.
const OWNER = 'RCTScrollView';
const SLOT = 'RCTScrollContentView';
const OWNER_TAG = 'symbiote-probe-scroll';
const CHILD = 'RCTImageView';

let built = 0;

function registerComposed(): void {
  built = 0;
  registerHostBehavior(OWNER_TAG, {
    buildStructure: node => {
      built += 1;
      const slot = createElement(SLOT);
      appendChild(node, slot);
      return slot;
    },
    attach() {},
    detach() {},
  });
}

// A behavior with a runtime and no structure — the control for every "the slot did it" claim
// below. Without it, an assertion about redirected children cannot tell the redirect from the
// engine simply appending where it was told.
function registerFlat(): void {
  registerHostBehavior('symbiote-probe-flat', { attach() {}, detach() {} });
}

function mount(): {
  surface: ReturnType<typeof createSurface>;
  root: ISymbioteNode;
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  surface.commit();
  return { surface, root };
}

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('buildStructure', () => {
  it('runs once at createElement and publishes the slot', () => {
    registerComposed();
    const owner = createElement(OWNER, false, OWNER_TAG);

    expect(built).toBe(1);
    expect(owner.children).toHaveLength(1);
    expect(owner.childHost).toBe(owner.children[0]);
    expect(owner.childHost?.component).toBe(SLOT);
  });

  it('leaves childHost undefined for a behavior that declares none', () => {
    registerFlat();
    const flat = createElement('RCTView', false, 'symbiote-probe-flat');
    const child = createElement(CHILD);
    appendChild(flat, child);

    expect(flat.childHost).toBeUndefined();
    expect(flat.children).toEqual([child]);
  });

  it('builds through the ordinary mutation API, so the slot is an ordinary node', () => {
    registerComposed();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const slot = owner.childHost as ISymbioteNode;

    expect(slot.parent).toBe(owner);
    expect(slot.childHost).toBeUndefined();
  });
});

describe('the child redirect', () => {
  it('appends app children into the slot, never onto the owner', () => {
    registerComposed();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const first = createElement(CHILD);
    const second = createElement(CHILD);
    appendChild(owner, first);
    appendChild(owner, second);

    expect(owner.children).toEqual([owner.childHost]);
    expect(owner.childHost?.children).toEqual([first, second]);
    expect(first.parent).toBe(owner.childHost);
  });

  it('honours insertBefore ordering inside the slot', () => {
    registerComposed();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const a = createElement(CHILD);
    const b = createElement(CHILD);
    const c = createElement(CHILD);
    appendChild(owner, a);
    appendChild(owner, c);
    // The anchor is a child of the SLOT while the parent named is the OWNER — the exact call every
    // adapter makes, and the one an un-redirected insertBefore resolves by appending at the end.
    insertBefore(owner, b, c);

    expect(owner.childHost?.children).toEqual([a, b, c]);
  });

  it('removes through the owner, which an un-redirected splice would silently miss', () => {
    registerComposed();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const child = createElement(CHILD);
    appendChild(owner, child);
    removeChild(owner, child);

    expect(owner.childHost?.children).toEqual([]);
    expect(child.parent).toBeUndefined();
    // The structure itself is not collateral: a removal aimed at an app child must not reach it.
    expect(owner.children).toEqual([owner.childHost]);
  });
});

describe('what Fabric is asked to commit', () => {
  it('commits owner > slot > children, with no adapter knowledge of the slot', () => {
    registerComposed();
    const { surface, root } = mount();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const child = createElement(CHILD);
    appendChild(owner, child);
    appendChild(root, owner);
    surface.commit();

    const committed = fabric.find(node => node.viewName === OWNER);
    expect(committed).toBeDefined();
    expect(fabric.serialize([committed as never])).toBe(
      `${OWNER}(${SLOT}(${CHILD}))`,
    );
  });
});

describe('park and unpark', () => {
  it('does not rebuild the structure when a torn-down node is re-inserted', () => {
    registerComposed();
    const { surface, root } = mount();
    const owner = createElement(OWNER, false, OWNER_TAG);
    const child = createElement(CHILD);
    appendChild(owner, child);
    appendChild(root, owner);
    surface.commit();

    const slotBefore = owner.childHost;

    // Svelte parks a live subtree offscreen across commits: removed, swept at commit, then put
    // back. `attach` re-runs (the machine restarts); `buildStructure` must NOT.
    removeChild(root, owner);
    surface.commit();
    appendChild(root, owner);
    surface.commit();

    expect(built).toBe(1);
    expect(owner.childHost).toBe(slotBefore);
    expect(owner.children).toEqual([slotBefore]);
    expect(slotBefore?.children).toEqual([child]);
  });
});
