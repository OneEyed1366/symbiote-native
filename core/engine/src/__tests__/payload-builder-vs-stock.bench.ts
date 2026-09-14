// OUR payload builder against REACT NATIVE'S OWN, on byte-identical input.
//
// The device answers the whole-row question already — stock Create 257.3 ms against Svelte's 234.6
// on the same 10-node row, with stock sending 87 001 prop keys to our 44 001 — but a row total
// cannot say whether one PART is behind. The payload builder is the only part of the two stacks
// that is directly comparable: everything else differs structurally (stock diffs fibers where we
// replay named ops; stock crosses JSI per node where we fill a buffer). This one function does not.
//
// `ReactNativeAttributePayload.create(props, validAttributes)` is exactly what React's Fabric host
// config calls on the create path, and it is reachable headless — its only imports are
// `flattenStyle` and `deepDiffer`, both pure JS. `BaseViewConfig.ios` supplies the real
// `validAttributes` for `RCTView`.
//
// GETTING THE INPUT IS THE WHOLE DIFFICULTY, and it is a property of our own design. A
// `SymbioteNode` carries no props at all — in the mutation-buffer engine a prop is an OP, and the
// accumulated bag lives in whatever host consumes the buffer. So there is no JS object to hand the
// two builders until something decodes the ops. `DECODER` below is that: a tree host that keeps the
// prop bag and nothing else, which is the same accumulation `tree-applier.ts` performs before it
// calls `fabricProps(node.handle, node.props)`.
//
// WHAT THE ARMS ARE NOT. Stock filters props against `validAttributes` and we do not, so the two do
// different work by design and a raw ratio is not a verdict on either implementation's quality. The
// number worth having is the ORDER OF MAGNITUDE — if ours were structurally slower, this is where
// it would show.

import { bench, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFabric } from '@symbiote-native/test-utils';
import { fabricProps } from '../fabric-props';
import {
  NO_VALUE,
  OP_CREATE_ELEMENT,
  OP_SET_PROP,
  OP_STRIDE,
  type IMutationBatch,
} from '../mutation-buffer';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  isSymbioteNode,
  registerRules,
  routeProp,
  setTreeHost,
  type ISymbioteNode,
} from '../index';
import { compileCssToRules } from '../../../css-parser/src/index.ts';
import {
  PRESSABLE_TAG,
  TEXT_INPUT_TAG,
  registerPressableBehavior,
  registerTextInputBehavior,
} from '../../../components/src/index.ts';

// `BaseViewConfig.ios` reaches `NativeModules`, which throws at MODULE SCOPE with no bridge config —
// the Tier-B floor `symbiote-rn-port-elimination` records. A minimal one suffices: the view config
// is a plain object literal and asks the bridge for nothing. Dynamic import, because a static one
// hoists above the assignment.
Object.assign(globalThis, {
  __fbBatchedBridgeConfig: { remoteModuleConfig: [] },
});
const { default: BaseViewConfig } =
  await import('react-native/Libraries/NativeComponent/BaseViewConfig.ios');
const { create: reactCreate } =
  await import('react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload');

// The decoder. Only two opcodes matter for a prop bag; every other op is structural and this host
// deliberately keeps no tree — a bag per node is the entire contract it needs to satisfy.
const bags = new Map<ISymbioteNode, Record<string, unknown>>();

function decode(batch: IMutationBatch): void {
  const { ops, strings, values, handles } = batch;
  for (let at = 0; at < ops.length; at += OP_STRIDE) {
    const opcode = ops[at];
    if (opcode === OP_CREATE_ELEMENT) {
      const handle = handles[ops[at + 1]];
      if (isSymbioteNode(handle)) bags.set(handle, {});
      continue;
    }
    if (opcode !== OP_SET_PROP) continue;
    const handle = handles[ops[at + 1]];
    if (!isSymbioteNode(handle)) continue;
    const bag = bags.get(handle);
    if (bag === undefined) continue;
    const key = strings[ops[at + 2]];
    if (ops[at + 3] === NO_VALUE) delete bag[key];
    else bag[key] = values[ops[at + 3]];
  }
}

// `installFabric()` first, for the fake `nativeFabricUIManager` alone — `createSurface` installs the
// event handler, which resolves the slot. It also installs the TypeScript applier as the tree host,
// and the line after replaces that: this bench wants the ops, not a tree.
installFabric();

const DECODER = {
  applyOps: decode,
  propOf: () => undefined,
  committedRecordOf: () => undefined,
  parentOf: () => undefined,
  childrenOf: () => [],
  census: () => ({ nodes: 0, texts: 0 }),
  dispatchCommand: () => {},
  sendAccessibilityEvent: () => {},
  measure: () => {},
  measureInWindow: () => {},
  measureLayout: () => {},
};
setTreeHost(Object(DECODER));

// The APP'S OWN stylesheet through the real parser, and the REAL host behaviors. Three earlier
// attempts at this measurement used hand-written versions of each and produced a payload of the
// wrong shape every time.
const compiled = compileCssToRules(
  readFileSync(
    new URL('../../../../examples/svelte/App.css', import.meta.url),
    'utf8',
  ),
  { filename: 'App.css' },
);
registerRules(Array.isArray(compiled) ? compiled : compiled.rules);
registerPressableBehavior();
registerTextInputBehavior();

const noop = () => {};

function buildRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'class', 'bench-row');

  const idText = createElement('RCTText', true);
  routeProp(idText, 'class', 'bench-row-id');
  appendChild(idText, createRawText(String(id)));
  appendChild(row, idText);

  for (const [cls, label] of [
    ['flex1', 'bench-row-label'],
    ['bench-row-remove', 'bench-row-remove-text'],
  ] as const) {
    const press = createElement('RCTView', false, PRESSABLE_TAG);
    routeProp(press, 'class', cls);
    routeProp(press, 'onPress', noop);
    const text = createElement('RCTText', true);
    routeProp(text, 'class', label);
    appendChild(text, createRawText(`row ${id}`));
    appendChild(press, text);
    appendChild(row, press);
  }

  const input = createElement(
    'RCTSinglelineTextInputView',
    false,
    TEXT_INPUT_TAG,
  );
  routeProp(input, 'class', 'bench-row-input');
  routeProp(input, 'value', `row ${id}`);
  appendChild(row, input);

  return row;
}

const surface = createSurface(96_001);
for (let id = 0; id < 10; id += 1) surface.appendChild(buildRow(id));
surface.commit();

// One row-period of REAL nodes with their REAL prop bags. Cycled to benchmark size, which keeps the
// distribution — 40% of a row's nodes carry a single key and two carry ten or more.
const cases = [...bags].map(([node, props]) => ({ node, props }));
const validAttributes = BaseViewConfig.validAttributes;
const NODES = 10_000;

// The control. Both arms must be shown to PRODUCE something on this input, or a fast arm and an arm
// that early-returns look identical. Printed once at load, outside every timed region.
{
  const ourKeys = cases.reduce(
    (sum, entry) =>
      sum + Object.keys(fabricProps(entry.node, entry.props)).length,
    0,
  );
  const stockKeys = cases.reduce((sum, entry) => {
    const payload = reactCreate(entry.props, validAttributes);
    return sum + (payload === null ? 0 : Object.keys(payload).length);
  }, 0);

  console.log(
    `[control] ${cases.length} nodes — ours emits ${ourKeys} keys, stock emits ${stockKeys}`,
  );
}

describe('building one create-path payload, ours against React Native own', () => {
  bench('ours — fabricProps', () => {
    let sink = 0;
    for (let at = 0; at < NODES; at += 1) {
      const entry = cases[at % cases.length];
      sink += Object.keys(fabricProps(entry.node, entry.props)).length;
    }
    if (sink < 0) throw new Error('unreachable');
  });

  bench('stock — ReactNativeAttributePayload.create', () => {
    let sink = 0;
    for (let at = 0; at < NODES; at += 1) {
      const entry = cases[at % cases.length];
      const payload = reactCreate(entry.props, validAttributes);
      sink += payload === null ? 0 : Object.keys(payload).length;
    }
    if (sink < 0) throw new Error('unreachable');
  });
});
