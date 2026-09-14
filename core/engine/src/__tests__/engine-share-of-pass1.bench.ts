// HOW MUCH OF `pass 1` IS OURS — the engine's own per-op JS on a create, priced in isolation.
//
// The question it answers is a design one: `routeProp`, the class registry, the structured-style
// resolution and the buffer encoding all run inside what the benchmark screen calls pass 1, mixed
// with the framework's own rendering. The screen cannot separate them — it times the whole step —
// so "could the adapters do this instead" has never had a number attached, only an argument.
//
// THIS BENCH IS DIRECT, unlike every create-path bench in this repo, and the reason matters. The
// standing rule is that a headless win on a NATIVE-BOUND path must be divided by that path's JS
// share (~24% on create) before it is quoted, because `installFabric()` stubs Fabric, Yoga and the
// JSI crossing to zero. Nothing here touches any of them: the tree host is a NO-OP, so what is
// timed is pure JS bookkeeping, and a JS-bound path is measured at face value.
//
// The three arms decompose the cost rather than just totalling it:
//
//   routeProp     today's path — one dispatch per prop, the classification done at runtime
//   setProp       every key pre-classified, as if a transform had resolved it at build time.
//                 The FLOOR of "what if dispatch were free", and deliberately optimistic: a real
//                 adapter still cannot pre-resolve a `class` (the cascade is dynamic) or an `on*`.
//   structure     createElement + appendChild only, no props at all — the irreducible node cost.
//
// routeProp − setProp is the prize for moving classification to compile time.
// setProp − structure is what a prop write costs once nothing has to decide what it is.
// structure alone is what no design choice can remove.
//
// The workload is `examples/*`'s real benchmark row, 10 native views and ~15 writes per row, at the
// same 1 000 rows the device runs — so the number is comparable to the ~200 ms that column reports
// rather than to an invented shape.
//
// HOW THE ROW IS SPELLED IS NOT A VARIABLE HERE, which is why this bench survived the tags
// migration unchanged. Whatever an adapter is handed, its renderer ends at
// `createElement(..., 'symbiote-pressable')` + `routeProp`. What is timed below is the engine, and
// the engine cannot tell one source spelling from another.
//
// WHAT IS DELIBERATELY OUT OF FRAME, stated because the omission understates the total. The row's
// two Pressables and its TextInput each carry a host BEHAVIOR, and the machines themselves live in
// `@symbiote-native/components`, which the engine does not depend on and must not. So the stand-in
// below exercises the engine's half — the tag lookup and the `attach` call, once per behavior-
// bearing node — and not the machines' own construction. That construction is shared-layer cost,
// not adapter-ownable either, so leaving it out moves the SIZE of "our half" and not the answer to
// "could an adapter do this instead".

import { bench, describe } from 'vitest';
// Internal, deliberately: the recorders are not on the package barrel, and the buffer arm below has
// to reach the layer directly rather than through the API that sits on top of it.
import {
  recordAppendChild,
  recordCreateElement,
  recordCreateRawText,
  recordSetProp,
  takeBatch,
} from '../mutation-buffer';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  registerHostBehavior,
  registerRules,
  routeProp,
  setProp,
  setTreeHost,
} from '../index';

// A host that ACCEPTS the batch and does nothing with it. Two reasons it is not simply `undefined`:
// with no host the ops stay PENDING by design (`tree-host.ts` refuses to drain into nothing), so the
// buffer would grow across every iteration and the bench would measure array growth and GC; and the
// applier that normally sits here stands in for what C++ does on device, which is the OTHER half of
// the step. Draining into a no-op is what leaves exactly our own JS on the clock.
const NOTHING = {
  applyOps: () => {},
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
setTreeHost(Object(NOTHING));

// The row's seven classes, with the declaration counts `examples/solid/screens/BenchmarkScreen.css`
// actually carries — a class resolving to nothing would make the registry lookup free and the
// measurement a lie.
registerRules(
  [
    ['bench-row', { flexDirection: 'row', alignItems: 'center', height: 44 }],
    ['bench-row-selected', { backgroundColor: '#1d4ed8' }],
    ['bench-row-id', { width: 48, color: '#94a3b8' }],
    ['flex1', { flex: 1 }],
    ['bench-row-label', { color: '#e2e8f0', fontSize: 15 }],
    ['bench-row-remove', { width: 44, alignItems: 'center' }],
    ['bench-row-remove-text', { color: '#f87171', fontSize: 18 }],
    [
      'bench-row-input',
      {
        backgroundColor: '#0f172a',
        borderRadius: 6,
        color: '#e2e8f0',
        height: 32,
        paddingLeft: 8,
        paddingRight: 8,
        width: 96,
      },
    ],
  ].map(([token, style], order) => ({
    tokens: [String(token)],
    specificity: [0, 1, 0] as const,
    order,
    style: Object(style),
  })),
);

// Stand-ins for the press and text-input machines, carrying the real `ownedListeners` sets so
// `setEventListener` takes the stash branch the way it does on a device. Without ANY registration
// `hasHostBehaviors()` is false and `createElement` skips the lookup entirely — a whole path the
// real row walks 3 000 times per create, and its absence would read as a clean measurement.
registerHostBehavior('symbiote-pressable', {
  attach: () => {},
  ownedListeners: [
    'press',
    'pressIn',
    'pressOut',
    'pressMove',
    'longPress',
    'startShouldSetResponder',
    'responderMove',
    'responderTerminationRequest',
  ],
});
registerHostBehavior('symbiote-text-input', {
  attach: () => {},
  ownedListeners: ['change', 'changeText', 'keyPress'],
});

const ROWS = 1000;
const noop = () => {};

let nextRootTag = 90_000;
function freshRoot() {
  return createSurface((nextRootTag += 1));
}

// One row, built the way Solid emits it: bare intrinsics, no wrapper components, the
// class strings the CSS above registers, and `value` on a controlled input.
function buildRow(
  write: (
    node: ReturnType<typeof createElement>,
    key: string,
    value: unknown,
  ) => void,
  id: number,
) {
  const row = createElement('RCTView');
  write(row, 'class', 'bench-row');

  const idText = createElement('RCTText', true);
  write(idText, 'class', 'bench-row-id');
  appendChild(idText, createRawText(String(id)));
  appendChild(row, idText);

  const pressLabel = createElement('RCTView', false, 'symbiote-pressable');
  write(pressLabel, 'class', 'flex1');
  write(pressLabel, 'onPress', noop);
  const label = createElement('RCTText', true);
  write(label, 'class', 'bench-row-label');
  appendChild(label, createRawText(`row ${id}`));
  appendChild(pressLabel, label);
  appendChild(row, pressLabel);

  const pressRemove = createElement('RCTView', false, 'symbiote-pressable');
  write(pressRemove, 'class', 'bench-row-remove');
  write(pressRemove, 'onPress', noop);
  const cross = createElement('RCTText', true);
  write(cross, 'class', 'bench-row-remove-text');
  appendChild(cross, createRawText('x'));
  appendChild(pressRemove, cross);
  appendChild(row, pressRemove);

  const input = createElement(
    'RCTSinglelineTextInputView',
    false,
    'symbiote-text-input',
  );
  write(input, 'class', 'bench-row-input');
  write(input, 'value', `row ${id}`);
  appendChild(row, input);

  return row;
}

// Structure-only: the same ten nodes and the same parenting, every prop write dropped.
function buildRowStructureOnly(id: number) {
  return buildRow(() => {}, id);
}

// The COMMAND BUFFER alone — the op sequence a row produces, written straight into the recorder
// with no engine logic above it. This arm exists because the buffer is the one thing pass 1 gained
// that the JS-tree architecture never had, so it is the standing suspect for a pass-1 regression,
// and a suspect is worth a number rather than an argument.
//
// The shape is deliberately the same 10 nodes and ~15 writes; only the layer differs.
function bufferRow(surfaceHandle: object, id: number): void {
  const emit = (component: string, isText: boolean): object => {
    const handle = {};
    recordCreateElement(handle, component, isText, handle);
    return handle;
  };
  const row = emit('RCTView', false);
  recordSetProp(row, 'class', 'bench-row');

  const idText = emit('RCTText', true);
  recordSetProp(idText, 'class', 'bench-row-id');
  const idRaw = {};
  recordCreateRawText(idRaw, String(id));
  recordAppendChild(idText, idRaw);
  recordAppendChild(row, idText);

  for (const [cls, label] of [
    ['flex1', 'bench-row-label'],
    ['bench-row-remove', 'bench-row-remove-text'],
  ]) {
    const press = emit('RCTView', false);
    recordSetProp(press, 'class', cls);
    recordSetProp(press, 'onPress', true);
    const text = emit('RCTText', true);
    recordSetProp(text, 'class', label);
    const raw = {};
    recordCreateRawText(raw, `row ${id}`);
    recordAppendChild(text, raw);
    recordAppendChild(press, text);
    recordAppendChild(row, press);
  }

  const input = emit('RCTSinglelineTextInputView', false);
  recordSetProp(input, 'class', 'bench-row-input');
  recordSetProp(input, 'value', `row ${id}`);
  recordAppendChild(row, input);

  recordAppendChild(surfaceHandle, row);
}

function createAll(
  write: (
    node: ReturnType<typeof createElement>,
    key: string,
    value: unknown,
  ) => void,
) {
  const surface = freshRoot();
  for (let id = 0; id < ROWS; id += 1) {
    appendChild(surface, buildRow(write, id));
  }
  // Drains the buffer into the no-op host and resets it, so the next iteration starts empty.
  surface.commit();
}

describe('the engine half of pass 1, on a 1 000-row create', () => {
  bench('routeProp — today', () => {
    createAll((node, key, value) => routeProp(node, key, value));
  });

  // The HARD FLOOR, and it is not a proposal: routing a `class` straight to `setProp` skips the
  // cascade resolution an adapter would still have to perform somewhere, and an `on*` skips the
  // listener registration entirely. It brackets the answer from below — if even this is close to
  // the arm above, then dispatch is not where the time is and there is nothing to hand over.
  bench('setProp — dispatch AND cascade both free (unreachable floor)', () => {
    createAll((node, key, value) => setProp(node, key, value));
  });

  // Deliberately not `createSurface` — this arm must contain the recorder and nothing else, and a
  // real surface would drag `installEventHandler` and the surface registry in with it.
  bench('command buffer only — no engine logic above it', () => {
    const surfaceHandle = {};
    recordCreateElement(surfaceHandle, '#surface', false, surfaceHandle);
    for (let id = 0; id < ROWS; id += 1) bufferRow(surfaceHandle, id);
    takeBatch();
  });

  bench('structure only — no props', () => {
    const surface = freshRoot();
    for (let id = 0; id < ROWS; id += 1) {
      appendChild(surface, buildRowStructureOnly(id));
    }
    surface.commit();
  });
});
