// A style nobody authored must cross as a DELETE, not as an array of two undefineds.
//
// `pushClassStyle` publishes `[baseStyleOf(parts), explicitStyleOf(parts)]` unconditionally, so a
// node whose class resolves to nothing and whose `style` is absent still publishes a real
// two-element array. The buffer has a dedicated encoding for exactly this — `recordSetProp` maps
// `undefined` to `NO_VALUE` and the host then takes the cheap path, `if (node->props.get_ptr(key)
// == nullptr) break` — and the array defeats it: a values entry, a `folly::dynamic` conversion, a
// stored key and a `diffProps` comparison every commit, for a style that does not exist.
//
// Counted rather than timed, per this investigation's rule. The quantity is one values entry per
// unstyled node per commit, which on the benchmark row's own shape (`<view style={isSelected ? {…}
// : undefined}>`, none of a thousand rows selected) is a thousand of them.
//
// The reason this was recorded and not fixed (F-22) is the restore path, and it is what the last
// case here pins: `setNativeProps` writes the style slot past this file and CLEARS
// `parts.published`, so the next declarative write must reach the host — and when the authored
// style is nothing, "restore to nothing" is a real delete of a key that now exists.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  NO_VALUE,
  OP_SET_PROP,
  OP_STRIDE,
  type IMutationBatch,
} from '../mutation-buffer';
import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  setNativeProps,
  setTreeHost,
  treeHost,
  type ISymbioteNode,
} from '../index';

// A RECORDING host: this file asks what went ON THE WIRE, which is the op stream and the engine's
// own payload — not what a renderer made of it.
const fabric = installRecordingFabric();
const ROOT_TAG = 7714;

type IStyleOps = {
  /** `setProp('style', …)` ops carrying a real value the host must convert and store. */
  readonly valued: number;
  /** `setProp('style', …)` ops encoded as a delete, which costs the host nothing. */
  readonly deletes: number;
};

let captured: IMutationBatch[] = [];

/**
 * Wrap the installed host ONCE.
 *
 * Calling this per case wraps the wrapper: the fourth case then sees every batch four times, and
 * the counts read as a clean multiple of the truth rather than as an obvious defect. Caught by the
 * one case whose expected number was known exactly — `valued: 4` for a single write.
 */
function captureBatches(): void {
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      // The batch's own arrays are reset by the next drain, so what is kept is a copy of the three
      // things this file reads. A reference would be emptied before any assertion ran.
      captured.push({
        ops: batch.ops.slice(),
        strings: [...batch.strings],
        values: [...batch.values],
        instanceHandles: batch.instanceHandles,
        handles: batch.handles,
      });
      base.applyOps(batch);
    },
  });
}

/**
 * Style ops belonging to the NODES UNDER TEST, and to nothing else.
 *
 * The surface's own root carries `{flex: 1}` and publishes it once per surface, which counted as a
 * valued style op and made every expectation here read one too high. A count that is a clean offset
 * from the truth is the hardest kind to notice — it was visible only because one case's expected
 * number was known exactly. Ops are attributed through `batch.handles[slot]`, which is the identity
 * `slotOf` recorded.
 */
function styleOps(subjects: ReadonlySet<object>): IStyleOps {
  let valued = 0;
  let deletes = 0;
  for (const batch of captured) {
    for (let at = 0; at + OP_STRIDE <= batch.ops.length; at += OP_STRIDE) {
      if (batch.ops[at] !== OP_SET_PROP) continue;
      if (batch.strings[batch.ops[at + 2]] !== 'style') continue;
      if (!subjects.has(batch.handles[batch.ops[at + 1]])) continue;
      if (batch.ops[at + 3] === NO_VALUE) deletes += 1;
      else valued += 1;
    }
  }
  captured = [];
  return { valued, deletes };
}

function unstyledRow(surface: ReturnType<typeof createSurface>): ISymbioteNode {
  const node = createElement('RCTView');
  // Exactly the benchmark row's shape: a class that carries the look, and a conditional `style`
  // that is `undefined` for every row that is not selected.
  routeProp(node, 'class', 'bench-row');
  routeProp(node, 'style', undefined);
  surface.appendChild(node);
  return node;
}

beforeAll(captureBatches);
beforeEach(() => {
  fabric.reset();
  captured = [];
});

describe('a style nobody authored', () => {
  it('crosses as a delete when neither half resolves to anything', () => {
    const surface = createSurface(ROOT_TAG);

    // No rules registered, so the class resolves to nothing and BOTH halves are undefined — the
    // case where the published array carries no information at all.
    const node = createElement('RCTView');
    routeProp(node, 'class', 'unknown-class');
    routeProp(node, 'style', undefined);
    surface.appendChild(node);
    surface.commit();

    expect(styleOps(new Set([node]))).toEqual({ valued: 0, deletes: 1 });
  });

  // The quantity, on the shape that produces it. One values entry per row is what F-22 priced at
  // ~1 000 ops and ~0.3 ms of folly conversion per 1 000-row create.
  it('costs nothing per row when a whole list is unselected', () => {
    const surface = createSurface(ROOT_TAG + 1);
    const rows = 100;
    const subjects = new Set<object>();
    for (let at = 0; at < rows; at += 1) subjects.add(unstyledRow(surface));
    surface.commit();

    const ops = styleOps(subjects);
    expect(ops.valued).toBe(0);
    expect(ops.deletes).toBe(rows);
  });

  // The second mechanism, and the larger of the two. `resolveClassName` used to answer a FRESH `{}`
  // for a class that resolves to nothing, and `isAlreadyPublished` compares slot 0 with `Object.is`
  // — so such a node could never be turned away and republished its style, and re-dirtied itself,
  // on every class or style write. That is the exact storm the guard was built to stop, measured on
  // device for Solid at WRITES 1001 for two nodes of change; it simply had a hole in it for any
  // node whose class matches nothing. One shared object closes the hole.
  it('turns away every write after the first once the delete is standing', () => {
    const surface = createSurface(ROOT_TAG + 4);
    const node = createElement('RCTView');
    surface.appendChild(node);
    routeProp(node, 'class', 'no-such-rule');
    surface.commit();
    captured = [];

    const subjects = new Set<object>([node]);
    for (let at = 0; at < 10; at += 1) routeProp(node, 'class', 'no-such-rule');
    surface.commit();

    expect(styleOps(subjects)).toEqual({ valued: 0, deletes: 0 });
  });

  // The negative control, and the reason the zeros above mean anything: a class that DOES resolve
  // must still publish a real value. Without this, "everything crosses as a delete" would pass.
  it('still publishes a real value when the class resolves', () => {
    registerRules([
      {
        tokens: ['bench-row'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
    ]);
    const surface = createSurface(ROOT_TAG + 2);
    const node = unstyledRow(surface);
    surface.commit();

    expect(styleOps(new Set([node])).valued).toBeGreaterThan(0);
    clearGlobalStyles();
  });

  // The restore path F-22 named as the blocker. `setNativeProps` writes the style slot past the
  // parts and clears the published marker; the next declarative write has to reach the host. With
  // no authored style that write is a DELETE of a key that now exists — which is why the guard may
  // key on "both halves are undefined" and not on "we have published nothing".
  it('deletes the slot again after setNativeProps wrote into it', () => {
    const surface = createSurface(ROOT_TAG + 3);
    const node = createElement('RCTView');
    appendChild(node, createElement('RCTView'));
    surface.appendChild(node);
    routeProp(node, 'style', undefined);
    surface.commit();

    setNativeProps(node, { style: { opacity: 0.5 } });
    surface.commit();

    captured = [];
    routeProp(node, 'style', undefined);
    surface.commit();

    expect(styleOps(new Set([node]))).toEqual({ valued: 0, deletes: 1 });
  });
});
