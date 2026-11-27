// The live reader exists for exactly one reason, and this file is that reason stated twice.
//
// A RECORDING remembers every node it ever saw created — that is what makes `host.find` cheap and
// what makes it the wrong tool for "is this still on screen". Half the converted suite asks that
// question: a popped route, an evicted list cell, a toggled-off portal. Searching the record
// answers "yes" forever.
//
// The second half is anchors. An anchor is structural bookkeeping; the commit walk drops it and
// puts its children in its place (`renderableChildren`), so a positional read that counts anchors
// is reading a different tree than the one it means.
//
// No Negative group: nothing here throws on bad input — `appRoot` throws when there is no app root,
// which is the harness failing rather than a contract being enforced, and it is covered by every
// other case needing it to work.

import { describe, expect, it } from 'vitest';
import {
  appendChild,
  childrenOf,
  createAnchor,
  createElement,
  createRawText,
  createSurface,
  removeChild,
  routeProp,
  setText,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { censusLive, createLiveTree } from './live-tree';
import { installRecordingFabric } from './recording-host';

const ROOT_TAG = 7_401;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// `createElement` takes no prop bag — props go on through `routeProp`, the same seam every adapter
// writes through, so `style` gets the class/style merge rather than landing raw.
function viewWith(props: Record<string, unknown>): ISymbioteNode {
  const node = createElement('view');
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  return node;
}

function mountTree(): {
  surface: ReturnType<typeof createSurface>;
  root: ISymbioteNode;
  kept: ISymbioteNode;
  dropped: ISymbioteNode;
} {
  fabric.reset();
  const surface = createSurface(ROOT_TAG);
  // The app root as every adapter's `mount()` builds it: one `box-none` container.
  const root = viewWith({ pointerEvents: 'box-none' });
  const kept = viewWith({ testID: 'kept' });
  const dropped = viewWith({ testID: 'dropped' });
  appendChild(root, kept);
  appendChild(root, dropped);
  surface.appendChild(root);
  surface.commit();
  return { surface, root, kept, dropped };
}

describe('the live tree reads what is on screen, not what was created', () => {
  // why: THE failure this reader exists to prevent. `host.find` is a search over the creation log,
  // so a node the app removed still answers it — and an assertion phrased "this label is gone"
  // then passes forever regardless of what the adapter did.
  it('drops a removed node while the recording still holds it', () => {
    const { surface, root, dropped } = mountTree();

    removeChild(root, dropped);
    surface.commit();

    expect(
      fabric.find(node => node.props.testID === 'dropped'),
      'the recording still remembers it',
    ).toBeDefined();
    expect(
      live.findLive(live.appRoot(), node => node.props.testID === 'dropped'),
      'the live tree does not',
    ).toBeUndefined();
    expect(
      live.findLive(live.appRoot(), node => node.props.testID === 'kept'),
    ).toBeDefined();
  });

  // why: an anchor is not a child anything native sees, so a count or a positional read that
  // includes one is off by however many the adapter happened to leave. Svelte leaves one per
  // block, Angular one per composed component — the two adapters where this is not a detail.
  it('flattens an anchor into the children it stands in for', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    const anchor = createAnchor();
    const behind = viewWith({ testID: 'behind-the-anchor' });
    appendChild(anchor, behind);
    appendChild(root, anchor);
    surface.appendChild(root);
    surface.commit();

    // Read from the authored root rather than `appRoot()`: the claim is about one parent's
    // children, and `appRoot()` answers with the surface, which sits one level above it.
    const kids = live.nodeOf(root).children;
    expect(kids, 'the anchor itself is not a child').toHaveLength(1);
    expect(kids[0].props.testID).toBe('behind-the-anchor');
  });

  // The commit walk skips an empty raw text, and Svelte leaves one per block as its anchor
  it('leaves out an empty raw text and shows it once it has text', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    const blank = createRawText('');
    appendChild(root, blank);
    appendChild(root, createRawText('shown'));
    surface.appendChild(root);
    surface.commit();

    expect(live.texts(root)).toEqual(['shown']);
    expect(live.nodeOf(root).children).toHaveLength(1);

    setText(blank, 'late');
    expect(live.nodeOf(root).children).toHaveLength(2);
  });

  // A test about the adapter's in-place text update asks for the node, not for what is painted
  it('keeps an empty raw text when asked for the nodes themselves', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    appendChild(root, createRawText(''));
    surface.appendChild(root);
    surface.commit();

    const nodes = createLiveTree(fabric, { keepBlankText: true });
    expect(nodes.nodeOf(root).children).toHaveLength(1);
    expect(live.nodeOf(root).children).toHaveLength(0);
  });

  // why: the two readings of a node are easy to confuse and the difference bites — `props` is the
  // author's bag (`style` is still an object), `payload` is what the engine hands the renderer
  // (style flattened, the RN processors run). A test asking about `padding` means the payload.
  it('separates the author prop bag from the Fabric payload', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    const styled = viewWith({ testID: 'styled', style: { padding: 7 } });
    appendChild(root, styled);
    surface.appendChild(root);
    surface.commit();

    const node = live.findLive(
      live.appRoot(),
      one => one.props.testID === 'styled',
    );
    expect(node?.props.padding, 'not in the author bag').toBeUndefined();
    expect(node?.payload.padding, 'flattened into the payload').toBe(7);
  });

  // The texts come in tree order, as a `findAll` over the recording is in creation order
  it('collects every raw text in tree order', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    const first = createRawText('second');
    const second = createRawText('first');
    // Appended in the opposite order to their creation, so a reader that answered off the record
    // would hand these back the other way round.
    appendChild(root, second);
    appendChild(root, first);
    surface.appendChild(root);
    surface.commit();

    expect(live.texts(root)).toEqual(['first', 'second']);
  });

  // The native host answers a census with zeroes (`native-tree-host.ts`), so the count is read
  // off the engine's own child links
  it('counts the retained tree without asking a host', () => {
    fabric.reset();
    const surface = createSurface(ROOT_TAG);
    const root = viewWith({ pointerEvents: 'box-none' });
    const anchor = createAnchor();
    const behind = viewWith({ testID: 'behind-the-anchor' });
    appendChild(anchor, behind);
    appendChild(root, anchor);
    appendChild(root, viewWith({ testID: 'plain' }));
    surface.appendChild(root);
    surface.commit();

    // Counted from the authored root: four nodes (root, anchor, behind, plain), one of them an
    // anchor. The walk must NOT flatten, which is the difference from `walkLive`.
    const census = censusLive(root);
    expect(census.nodes).toBe(4);
    expect(census.anchors).toBe(1);
    expect(census.nonAnchors).toBe(3);

    // Serialized, the anchor is gone: `serialize` reads the flattened tree, like `walkLive`
    // The name is `view` as `viewWith` creates it, an adapter is what asks for `RCTView`
    expect(live.serialize(root)).toBe('view(viewview)');

    // Several roots at once, because a surface holds a LIST of top-level nodes and the files that
    // census one hand `surface.children` straight in.
    const perRoot = childrenOf(root).map(child => censusLive(child));
    expect(censusLive(...childrenOf(root))).toEqual({
      nodes: perRoot[0].nodes + perRoot[1].nodes,
      anchors: perRoot[0].anchors + perRoot[1].anchors,
      nonAnchors: perRoot[0].nonAnchors + perRoot[1].nonAnchors,
    });
  });
});
