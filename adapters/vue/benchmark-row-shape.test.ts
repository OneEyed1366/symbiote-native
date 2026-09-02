// Why the benchmark row carries its TextInput UNCONDITIONALLY, and that it commits ten views with
// no anchor.
//
// The row-shape toggle is gone — one TextInput has been priced as a delta and the arm only split
// later measurements in two. What survives is the reason the input was never a `v-if` child: the
// acceptance bar was first written in Fabric counters (byte-identical `createNode`/`appendChild`),
// and that bar cannot see the cost that actually mattered. A child that renders nothing still
// occupies the RETAINED tree, which is what `VISITED` and the reconcile window are measured over —
// the same currency Svelte's anchors turned out to be, where 14 004 of them sat against 9 001 real
// nodes.
//
// So the question was measured in TWO numbers rather than one, and the answer is non-zero. Put the
// input behind a condition and every row carries an anchor while passing every counter the bar
// names.

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, h, type Component } from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import { isAnchor, type ISymbioteNode } from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import * as runtimeHelpers from './src/runtime-helpers';
import metroVueTransformer from './metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;

const ROOT_TAG = 6120;
const EXAMPLE = 'examples/vue-sfc/components';
const fabric = installFabric();

const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  throw new Error(
    `compiled row required an unexpected specifier: ${specifier}`,
  );
};

function evaluate(code: string): Component {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const evaluated = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', outputText)(
    moduleRequire,
    evaluated,
    evaluated.exports,
  );
  const component = evaluated.exports.default;
  if (typeof component !== 'object' || component === null) {
    throw new Error('the compiled row has no default-exported component');
  }
  return component as Component;
}

function census(roots: readonly ISymbioteNode[]): {
  retained: number;
  anchors: number;
} {
  let retained = 0;
  let anchors = 0;
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    retained += 1;
    if (isAnchor(node)) anchors += 1;
    for (const child of node.children) stack.push(child);
  }
  return { retained, anchors };
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IProbe = {
  retained: number;
  anchors: number;
  createNode: number;
  shape: string[];
  // `shape` net of the surface's own container view, which is the forest root and would otherwise
  // be counted as part of whatever was rendered into it.
  contentShape: string[];
};

// Every committed node as `viewName{key=value,…}`, in tree order — VALUES included, and that is
// what makes the drift guard real. Keys alone do not move when a class does: `class` is consumed
// into `style` by routeProp, so a row that gained or renamed one commits the same key set. Measured
// — the first version of this guard compared keys, and renaming a class in one row file passed it.
function shapeOf(nodes: readonly IFakeNode[], out: string[]): string[] {
  for (const node of nodes) {
    const props = Object.keys(node.props)
      .sort()
      .map(
        key =>
          `${key}=${JSON.stringify(node.props[key]) ?? typeof node.props[key]}`,
      )
      .join(',');
    out.push(`${node.viewName}{${props}}`);
    shapeOf(node.children, out);
  }
  return out;
}

// One rule per class the rows use, each carrying a value unique to its token. Without them a class
// resolves to no style at all and every class difference is invisible in the payload — the guard
// would then be comparing two rows that both commit nothing for `class`.
const ROW_RULES = [
  'bench-row',
  'bench-row-selected',
  'bench-row-id',
  'bench-row-label',
  'bench-row-remove',
  'bench-row-remove-text',
  'bench-row-input',
  'flex1',
].map((token, order) => ({
  tokens: [token],
  specificity: [0, 1, 0] as [number, number, number],
  order,
  style: { marginTop: order + 1 },
}));

async function probe(render: () => unknown): Promise<IProbe> {
  fabric.reset();
  const surface = mount(
    ROOT_TAG,
    defineComponent({ setup: () => () => render() }),
  );
  await tick();
  const counted = census(surface.children);
  const probed = {
    ...counted,
    createNode: fabric.counts.createNode,
    shape: shapeOf(fabric.committed, []),
    contentShape: shapeOf(
      fabric.committed.flatMap(node => node.children),
      [],
    ),
  };
  unmount(ROOT_TAG);
  return probed;
}

// The FIRST mount in a process pays for chrome the next ones reuse, so an arm measured cold reads
// one `createNode` different from the same arm measured warm — which showed up here as the null
// child appearing to REDUCE Fabric calls. Both arms are taken after this, never across it.
beforeAll(async () => {
  engine.registerRules(ROW_RULES);
  await probe(() => h('symbiote-view', null, []));
});

describe('a conditional child costs the retained tree what Fabric cannot see', () => {
  // The measurement the form rests on. `null` and `false` are the two spellings a JSX arm produces;
  // an SFC `v-if` compiles to the same placeholder.
  it.each([
    ['a null child', null],
    ['a false child', false],
  ])('%s: +1 retained anchor, +0 createNode', async (_what, absent) => {
    const withoutCondition = await probe(() =>
      h('symbiote-view', null, [h('symbiote-text', null, 'a')]),
    );
    const withCondition = await probe(() =>
      h('symbiote-view', null, [h('symbiote-text', null, 'a'), absent]),
    );

    expect(withCondition.createNode, 'Fabric sees nothing').toBe(
      withoutCondition.createNode,
    );
    expect(withCondition.retained, 'the retained tree does').toBe(
      withoutCondition.retained + 1,
    );
    expect(withCondition.anchors).toBe(withoutCondition.anchors + 1);
  });

  // The control, and it is what makes the two assertions above mean anything: without it, "+1
  // retained" reads the same as a harness that miscounts by one.
  it('a child that DOES render costs a real node, not an anchor', async () => {
    const withoutChild = await probe(() =>
      h('symbiote-view', null, [h('symbiote-text', null, 'a')]),
    );
    const withChild = await probe(() =>
      h('symbiote-view', null, [
        h('symbiote-text', null, 'a'),
        h('symbiote-text', null, 'b'),
      ]),
    );

    expect(withChild.anchors).toBe(withoutChild.anchors);
    expect(withChild.createNode).toBeGreaterThan(withoutChild.createNode);
  });
});

describe('the benchmark row is ten views, the last an input, with no anchor', () => {
  const ROW = { id: 7, label: 'row 7' };
  const noop = (): void => {};

  async function mountRow(file: string): Promise<IProbe> {
    const source = readFileSync(`${EXAMPLE}/${file}`, 'utf8');
    const component = evaluate(await compileSfc(source, `/bench/${file}`));
    return probe(() =>
      h(component, {
        row: ROW,
        isSelected: false,
        onSelect: noop,
        onRemove: noop,
      }),
    );
  }

  // TEN is load-bearing rather than descriptive: the screen turns a row count into a view count
  // with it, and a row that drifts to 9 or 11 puts every number on the readout ~10% off the other
  // canaries while nothing goes red.
  it('commits ten views, the trailing one a single-line input', async () => {
    const row = await mountRow('BenchmarkRow.vue');

    expect(row.contentShape).toHaveLength(10);
    expect(row.contentShape[row.contentShape.length - 1]).toMatch(
      /^RCTSinglelineTextInputView\{/,
    );
    // No anchor: that is the property the unconditional input exists for, and the two measurements
    // above are what make its absence worth asserting.
    expect(row.anchors).toBe(0);
  });
});
