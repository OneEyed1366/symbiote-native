// A property test over the commit path: drive a SEEDED random mutation program into the retained
// tree, commit, and assert the committed Fabric tree is the one the retained tree describes.
//
// Why this exists rather than more unit tests. The commit walk is guarded by dirty marking, and its
// failure mode is SILENT: a mutation whose mark is missed leaves the walk skipping a subtree that
// changed, so the app shows stale UI with every suite green. Enumerated tests only cover the
// sequences someone thought of, and the marks are set in eight places across node.ts and surface.ts
// (appendChild, insertBefore, removeChild, setProp, setText, setNodeComponent, the surface's own
// splice path, and the container at the commit entry point). The interactions between them are what
// a fuzzer reaches and a case list does not.
//
// THE ORACLE IS AN INDEPENDENT REIMPLEMENTATION, deliberately. `expectedTree` below walks
// `node.children` naively — flattening anchors, skipping empty raw text, flipping RCTText to
// RCTVirtualText under a text ancestor — rather than calling the engine's own `renderableChildren`
// and `viewNameFor`. Sharing those would make a bug in them invisible to the test, which is the
// whole point of a differential oracle: two implementations of one spec, and a divergence means one
// of them is wrong. The cost is that the rules are stated twice; the rules are ~20 lines and the
// bug class is device-only, so the trade is worth it.
//
// It is also the oracle the touched-set commit strategy will be built against: an implementation
// that visits only dirty nodes is correct exactly when it still satisfies this, and nothing about
// this file needs to change when it lands.

import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  insertBefore,
  isAnchor,
  removeChild,
  setProp,
  setText,
  RAW_TEXT_COMPONENT,
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  type ISymbioteNode,
} from '../node';
import { createSurface, type SymbioteSurface } from '../surface';

// mulberry32 — a seeded PRNG, so a failure names a seed that reproduces it exactly. `Math.random`
// would make a red run unreproducible, which for a fuzzer is the difference between a bug report
// and a rumour.
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface IExpected {
  viewName: string;
  props: Record<string, unknown>;
  children: IExpected[];
}

// The rules the commit walk applies, restated independently (see the header).
function expectedChildren(
  node: ISymbioteNode,
  inText: boolean,
): IExpected[] {
  const out: IExpected[] = [];
  for (const child of node.children) {
    // An anchor never becomes a Fabric view; its children take its place in the parent's list.
    if (isAnchor(child)) {
      out.push(...expectedChildren(child, inText));
      continue;
    }
    // An empty RCTRawText aborts Fabric's text walk, so the engine drops it.
    if (child.component === RAW_TEXT_COMPONENT && child.props.text === '') {
      continue;
    }
    const childInText = child.isText || inText;
    out.push({
      viewName:
        child.component === TEXT_COMPONENT && inText
          ? VIRTUAL_TEXT_COMPONENT
          : child.component,
      props: child.props,
      children: expectedChildren(child, childInText),
    });
  }
  return out;
}

// Compared on VIEW NAME, child ORDER and the props the program wrote — not on tags, which are
// allocated per commit and legitimately differ between runs.
function describeExpected(nodes: readonly IExpected[]): string {
  return JSON.stringify(
    nodes.map(function map(node): unknown {
      return {
        v: node.viewName,
        // Only the keys this program writes. A full prop dump would drag in style plumbing the
        // oracle has no business restating, and the marks are what is under test.
        p: {
          testID: node.props.testID,
          text: node.props.text,
        },
        c: (node.children as IExpected[]).map(map),
      };
    }),
  );
}

function describeCommitted(nodes: readonly IFakeNode[]): string {
  return JSON.stringify(
    nodes.map(function map(node): unknown {
      return {
        v: node.viewName,
        p: { testID: node.props.testID, text: node.props.text },
        c: node.children.map(map),
      };
    }),
  );
}

type IOp = (rng: () => number, pool: ISymbioteNode[], surface: SymbioteSurface) => void;

function pick<T>(rng: () => number, list: readonly T[]): T | undefined {
  return list.length === 0 ? undefined : list[Math.floor(rng() * list.length)];
}

// Containers only — a raw text node may not take children, and the engine is entitled to assume it.
// A fuzzer that builds an invalid tree tests the harness's tolerance, not the engine's correctness.
function containers(pool: readonly ISymbioteNode[]): ISymbioteNode[] {
  return pool.filter(node => node.component !== RAW_TEXT_COMPONENT);
}

const OPS: IOp[] = [
  // create + append
  (rng, pool, surface) => {
    const kind = rng();
    const node =
      kind < 0.15
        ? createAnchor()
        : kind < 0.3
          ? createElement(TEXT_COMPONENT, true)
          : createElement('RCTView');
    const parent = pick(rng, containers(pool));
    if (parent === undefined) surface.appendChild(node);
    else appendChild(parent, node);
    pool.push(node);
  },
  // raw text under a text container, which is the only legal home for one
  (rng, pool) => {
    const parent = pick(
      rng,
      pool.filter(node => node.isText),
    );
    if (parent === undefined) return;
    const node = createRawText(`t${Math.floor(rng() * 1000)}`);
    appendChild(parent, node);
    pool.push(node);
  },
  // insertBefore — the op most likely to desync order if a mark is missed
  (rng, pool) => {
    const parent = pick(
      rng,
      containers(pool).filter(node => node.children.length > 0),
    );
    if (parent === undefined) return;
    const before = pick(rng, parent.children);
    if (before === undefined) return;
    const node = createElement('RCTView');
    insertBefore(parent, node, before);
    pool.push(node);
  },
  // remove
  (rng, pool, surface) => {
    const node = pick(rng, pool);
    if (node === undefined) return;
    const parent = node.parent;
    if (parent !== undefined) removeChild(parent, node);
    else surface.removeChild(node);
    const at = pool.indexOf(node);
    if (at >= 0) pool.splice(at, 1);
  },
  // MOVE, spelled as remove-then-reinsert, which is how every framework spells it
  (rng, pool) => {
    const node = pick(
      rng,
      pool.filter(n => n.parent !== undefined),
    );
    if (node === undefined) return;
    const target = pick(
      rng,
      containers(pool).filter(n => n !== node && !isDescendant(node, n)),
    );
    if (target === undefined) return;
    appendChild(target, node);
  },
  // prop write
  (rng, pool) => {
    const node = pick(rng, pool);
    if (node === undefined || node.component === RAW_TEXT_COMPONENT) return;
    setProp(node, 'testID', `id${Math.floor(rng() * 100)}`);
  },
  // text write
  (rng, pool) => {
    const node = pick(
      rng,
      pool.filter(n => n.component === RAW_TEXT_COMPONENT),
    );
    if (node === undefined) return;
    setText(node, `t${Math.floor(rng() * 1000)}`);
  },
];

function isDescendant(
  ancestor: ISymbioteNode,
  candidate: ISymbioteNode,
): boolean {
  let cursor: ISymbioteNode | undefined = candidate;
  while (cursor !== undefined) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

// ONE install for the module, per this suite's convention and not by preference: `getSlot()` caches
// the first slot it binds, so a second `installFabric()` in the same process hands back a recorder
// nothing ever writes to — every commit still reaches the FIRST fake. That failure presents as
// "expected a single box-none AppContainer root, got 0 node(s)", which reads as a broken commit
// rather than a broken harness.
const fabric = installFabric();

describe('commit fuzz — the committed tree matches the retained tree', () => {
  // Twelve seeds x 60 steps, committing every few steps so INCREMENTAL commits are exercised rather
  // than one cold mount. A missed mark is only observable across two commits: the first paints it,
  // the second is the one that must not skip it.
  const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

  for (const seed of SEEDS) {
    it(`seed ${seed}`, () => {
      fabric.reset();
      const recorder = fabric;
      const surface = createSurface(seed);
      const rng = createRng(seed);
      const pool: ISymbioteNode[] = [];

      for (let step = 0; step < 60; step += 1) {
        const op = OPS[Math.floor(rng() * OPS.length)];
        if (op !== undefined) op(rng, pool, surface);

        // Commit often, and on an irregular beat: a fixed cadence would only ever exercise programs
        // whose length divides it.
        if (rng() < 0.35) {
          surface.commit();
          expect(
            describeCommitted(recorder.appRoot().children),
            `seed ${seed}, step ${step}`,
          ).toBe(describeExpected(expectedChildren(rootOf(surface), false)));
        }
      }

      surface.commit();
      expect(describeCommitted(recorder.appRoot().children), `seed ${seed}, final`).toBe(
        describeExpected(expectedChildren(rootOf(surface), false)),
      );
    });
  }

  it('goes red when a structural mark is dropped', () => {
    // The break-test, and it is what makes every green above mean something. It reproduces the
    // exact defect the fuzzer exists for — a mutation that reaches the retained tree without
    // dirtying its parent — by splicing `parent.children` directly, which is what an adapter that
    // bypassed the mutation API would do.
    fabric.reset();
    const recorder = fabric;
    const surface = createSurface(9001);
    const parent = createElement('RCTView');
    const first = createElement('RCTView');
    const second = createElement('RCTView');
    appendChild(parent, first);
    appendChild(parent, second);
    surface.appendChild(parent);
    surface.commit();

    parent.children.splice(0, 1);
    surface.commit();

    expect(describeCommitted(recorder.appRoot().children)).not.toBe(
      describeExpected(expectedChildren(rootOf(surface), false)),
    );
  });
});

// The surface's top-level children, shaped as a node so the oracle has one entry point. Not a real
// engine node — only `children` is ever read off it.
function rootOf(surface: SymbioteSurface): ISymbioteNode {
  return { children: surface.children } as unknown as ISymbioteNode;
}
