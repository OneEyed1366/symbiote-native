// Dumps the REAL committed payloads of the benchmark row, so `core/engine/bench/dynamic-copy.cpp`
// can be run against what actually crosses instead of against a hand-written stand-in.
//
// The first version of that bench invented a 5-key payload. This project has a standing rule about
// exactly that shape of error — a hand-built stand-in for a value the system produces is not that
// value — and the invented one turned out to be nothing like the truth: the real row's payloads are
// wildly uneven, and the average key count hides it.
//
// Not a test of behaviour: it asserts only that it captured something, and writes a file. Named
// `.probe.` for the same reason the adapters' census probes are.

import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { installFabric } from '@symbiote-native/test-utils';
// By PATH, not by package name: `core/engine` does not depend on `core/css-parser` and must not
// start to for a probe's sake. A relative import reaches the source without touching the manifest.
import { compileCssToRules } from '../../../css-parser/src/index.ts';
import {
  PRESSABLE_TAG,
  TEXT_INPUT_TAG,
  registerPressableBehavior,
  registerTextInputBehavior,
} from '../../../components/src/index.ts';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  registerRules,
  routeProp,
} from '../index';

const fabric = installFabric();

// The APP'S OWN stylesheet, compiled by the real parser. Re-typing the declarations by hand is how
// the first two attempts at this measurement went wrong — once with an invented 5-key payload, once
// with invented rule bodies that produced 3.2 keys/node against the device's measured 4.4. The file
// is the only thing that cannot be wrong about itself.
const compiled = compileCssToRules(
  readFileSync(
    new URL('../../../../examples/svelte/App.css', import.meta.url),
    'utf8',
  ),
  { filename: 'App.css' },
);
registerRules(Array.isArray(compiled) ? compiled : compiled.rules);

// The REAL machines, by path for the same reason the parser is. A stand-in behavior with an empty
// `attach` was the third invented input in this measurement: the real ones carry a `foldPayload` and
// seed keys of their own (`mostRecentEventCount`), and without them the capture read 3.5 keys/node
// against the device's measured 4.4.
registerPressableBehavior();
registerTextInputBehavior();

const noop = () => {};

function buildRow(id: number) {
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

it('captures the committed payloads of one benchmark row', () => {
  const surface = createSurface(97_001);
  // Ten rows, not one: enough for every distinct node shape to appear, few enough to read.
  for (let id = 0; id < 10; id += 1) surface.appendChild(buildRow(id));
  surface.commit();

  const payloads: Array<Record<string, unknown>> = [];
  // The VIEW NAME travels with the payload, because a payload alone cannot say which
  // `ComponentDescriptor` parses it — and `core/engine/bench/props-construction.cpp` reads the two
  // together to price `ViewProps` against `ParagraphProps` and the text-input props. Without it the
  // bench can only measure the one descriptor it guessed.
  const viewNames: string[] = [];
  const walk = (node: {
    props: Record<string, unknown>;
    children: unknown[];
    viewName?: string;
  }) => {
    payloads.push(node.props);
    viewNames.push(node.viewName ?? '');
    for (const child of node.children) {
      if (child !== null && typeof child === 'object' && 'props' in child) {
        walk(Object(child));
      }
    }
  };
  for (const child of fabric.appRoot().children) walk(Object(child));

  // OPT-IN, and never a relative default: a test that writes on every full-suite run drops a file
  // into whatever directory the run started from, and the reflex repair for that is a .gitignore
  // entry, which hides the write instead of removing it.
  const keyCounts = payloads.map(p => Object.keys(p).length);
  const outPath = process.env.SYMBIOTE_PAYLOAD_OUT;
  if (outPath !== undefined) {
    writeFileSync(
      outPath,
      JSON.stringify({ payloads, keyCounts, viewNames }, null, 0),
    );
  }

  expect(payloads.length).toBeGreaterThan(50);
});
