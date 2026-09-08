// A BARE tag must commit what the `p={{…}}` bag commits.
//
// Until 2026-09-07 it committed NOTHING: `setAttribute` wrote an inert Map and no key ever reached
// `routeProp`, so `<view testID="x">` mounted an empty node with nothing red. That is the single
// reason Svelte's lowering transform was load-bearing for CORRECTNESS while it is an optimisation
// on every other adapter — the transform builds the bag, and only the bag was routed.
//
// The parity row is the point of the file; the rest exist so a failure says WHICH half broke.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createSurface,
  disposeRoot,
  registerRules,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { patchGlobals, restoreGlobals } from './patch-globals';
import { ShimElement } from './element';
import { createRootShimElement } from '../root-element';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const ROOT_TAG = 91_407;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let surface: SymbioteSurface | undefined;

beforeEach(() => {
  fabric.reset();
  patchGlobals();
  surface = createSurface(ROOT_TAG);
});

afterEach(() => {
  disposeRoot(ROOT_TAG);
  surface = undefined;
  restoreGlobals();
});

function liveRoot(): ShimElement {
  if (surface === undefined) throw new Error('surface not created');
  return createRootShimElement(surface);
}

// The LIVE committed tree, never `fabric.find()` — a search hit is the pre-clone node and would
// report the original bag forever.
function committedPropsOf(testID: string): Record<string, unknown> {
  const walk = (
    nodes: ReadonlyArray<{
      props: Record<string, unknown>;
      children: ReadonlyArray<unknown>;
    }>,
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(
        node.children.filter(
          (child): child is { props: Record<string, unknown>; children: [] } =>
            typeof child === 'object' && child !== null,
        ),
      );
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

async function mount(element: ShimElement): Promise<void> {
  liveRoot().appendChild(element);
  await tick();
}

describe('a bare intrinsic tag', () => {
  // why: attributes are written BEFORE the element joins a live tree — `from_tree` builds the node,
  // sets its attributes, then appends — so the pre-live buffer and its replay are the create path,
  // not an edge case.
  it('commits attributes written before it is live', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'bare');
    element.setAttribute('accessibilityLabel', 'hello');
    await mount(element);

    expect(committedPropsOf('bare').accessibilityLabel).toBe('hello');
  });

  it('commits an attribute written after it is live', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'bare');
    await mount(element);

    element.setAttribute('accessibilityLabel', 'later');
    await tick();
    expect(committedPropsOf('bare').accessibilityLabel).toBe('later');
  });

  // why: the reset half. A conditional attribute that stops being emitted has to reach Fabric as an
  // explicit reset, or the native view keeps painting the old value.
  it('resets a removed attribute', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'bare');
    element.setAttribute('accessibilityLabel', 'before');
    await mount(element);

    element.removeAttribute('accessibilityLabel');
    await tick();
    expect(committedPropsOf('bare').accessibilityLabel ?? null).toBeNull();
  });

  // why: `set_attribute` hands the raw value through for a name with no prototype setter, so an
  // object `style` arrives unstringified. The DOM would coerce it; routing must not.
  it('routes a non-string value without stringifying it', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'bare');
    element.setAttribute('style', { width: 12 });
    await mount(element);

    expect(committedPropsOf('bare').width).toBe(12);
  });

  // why: the fold is the wrapper's job and a bare tag has no wrapper. `id` -> `nativeID` is the
  // alias every primitive in the spec declares; a raw `id` is a key no ViewConfig has, so Fabric
  // drops it and the nativeID is lost on device with nothing red.
  it('applies the primitive fold', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'bare');
    element.setAttribute('id', 'ident');
    await mount(element);

    const props = committedPropsOf('bare');
    expect(props.nativeID).toBe('ident');
    expect(props.id).toBeUndefined();
  });
});

describe('a bare tag and the prop bag', () => {
  // THE row. Everything above narrows a failure; this one states the contract, and it is what makes
  // the lowering transform an optimisation on this adapter rather than a correctness dependency.
  it('commit the same payload for the same props', async () => {
    const props: Record<string, unknown> = {
      accessibilityLabel: 'hello',
      id: 'ident',
      style: { width: 12 },
    };

    const bare = new ShimElement('view');
    bare.setAttribute('testID', 'bare');
    for (const [name, value] of Object.entries(props))
      bare.setAttribute(name, value);
    await mount(bare);

    const bagged = new ShimElement('view');
    bagged.p = { testID: 'bagged', ...props };
    await mount(bagged);

    const { testID: _bareId, ...bareProps } = committedPropsOf('bare');
    const { testID: _bagId, ...bagProps } = committedPropsOf('bagged');
    expect(bareProps).toEqual(bagProps);
    // A pair of empty objects would satisfy the line above — this is what says both arms committed.
    expect(Object.keys(bareProps).length).toBeGreaterThan(2);
  });
});

// One element, two doors - the shape an APP writes and no adapter component does:
//
//   <view p={panResponder.panHandlers} class="xy-box" style={{ transform }} />
//
// Compiled, that is `class` baked into the `from_tree` template, then `set_attribute(el, 'p', bag)`
// and `set_style(el, ...)` in one effect. Spelled as a SPREAD, every attribute funnels through
// `set_attributes` into one bag and the doors never meet. `set p` replaced the whole bag, so the
// class committed by `from_tree` was deleted one line later, with nothing red.
describe('a tag written through two doors at once', () => {
  it('keeps an attribute written before the bag', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'mixed');
    element.setAttribute('accessibilityLabel', 'from the template');
    element.p = { onPress: () => {} };
    await mount(element);

    expect(committedPropsOf('mixed').accessibilityLabel).toBe(
      'from the template',
    );
  });

  it('keeps an attribute written after the bag', async () => {
    const element = new ShimElement('view');
    element.p = { testID: 'mixed' };
    element.setAttribute('style', { width: 12 });
    await mount(element);

    expect(committedPropsOf('mixed').width).toBe(12);
  });

  // The device shape end to end. `class` is the key that was lost, and it carries a whole rule, so
  // losing it costs every declaration at once.
  it('resolves a class the template wrote, past a later bag', async () => {
    registerRules([
      {
        tokens: ['xy-box'],
        specificity: [0, 1, 0],
        order: 0,
        style: { width: 36, height: 36 },
      },
    ]);
    const element = new ShimElement('view');
    element.setAttribute('testID', 'mixed');
    element.setAttribute('class', 'xy-box');
    element.p = { accessibilityLabel: 'the bag arrived' };
    await mount(element);

    const props = committedPropsOf('mixed');
    expect(props.width).toBe(36);
    expect(props.height).toBe(36);
    // The control: without it, a bag that never landed would pass the two lines above.
    expect(props.accessibilityLabel).toBe('the bag arrived');
  });

  // The counterweight: `p` still OWNS its key set, or a conditional prop could never be cleared.
  it('still drops a key the bag stops carrying', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'mixed');
    element.p = { accessibilityLabel: 'first' };
    await mount(element);

    element.p = {};
    await tick();
    expect(committedPropsOf('mixed').accessibilityLabel ?? null).toBeNull();
  });

  // Fixed, not last-write-wins: svelte decides the setter order, so the app cannot.
  it('lets the attribute win over the same name in the bag', async () => {
    const element = new ShimElement('view');
    element.setAttribute('testID', 'mixed');
    element.setAttribute('accessibilityLabel', 'attribute');
    element.p = { accessibilityLabel: 'bag' };
    await mount(element);

    expect(committedPropsOf('mixed').accessibilityLabel).toBe('attribute');
  });
});
