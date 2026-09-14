// `onValueChange` must reach the app from a bare `text-input` TAG. There is no wrapper left, so
// this is not a second path — it is the only one.
//
// It is not a Fabric event; it is a fold over the raw `change` payload the wrapper used to perform
// in its own lifecycle. Before the engine grew that fold, a tag simply never called it: the field
// echoed keystrokes (native owns its own text) while every value the app derived from it stayed
// frozen. Device-found 2026-08-31 in examples/solid's canary, and reproduced by examples/svelte's
// own `Hello, ${name}` greeting.
//
// The repair lives in `core/components/src/behaviors/text-input.ts` (`callValueChange`), so all five
// adapters inherit it. This file is the Svelte-side proof that it actually arrives here, because the
// route to `node.props` is per-adapter: Svelte is a flat-bag adapter, so the prop travels through
// `routeProp`, whose `/^on[A-Z]/` branch diverts a handler to `setEventListener` — but only for an
// event the ViewConfig DECLARES. `valueChange` is not one, so it falls through to `setProp` and
// lands in `node.props`. That is a property of the engine's routing, not of this adapter, and it is
// exactly the kind of cross-layer assumption `.claude/rules/verify-the-deciding-side.md` says to
// measure rather than read.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { installFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const PROBE_OUT = join(__dirname, '.smoke-compiled-value-change-probe.mjs');
const ROOT_TAG = 9_301;
const SINGLELINE = 'RCTSinglelineTextInputView';
const TYPED_TEXT = 'ab';
const ACK_COUNT = 7;

// The probe reports through a global because it is compiled to a loose `.mjs` and imported by path,
// so there is no module boundary to hand a closure across.
const SINK = '__symbioteValueChangeSink';
const sink: string[] = [];
Object.assign(globalThis, { [SINK]: sink });

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The tag comes from the spec, not from a literal here: an entry renamed or given a different
// intrinsic must move this probe with it rather than leave it asserting about a tag nothing emits.
const TEXT_INPUT_TAG = HOST_PRIMITIVES.TextInput.intrinsic;

const SOURCE = [
  `<view>`,
  `  <${TEXT_INPUT_TAG} p={{ value: "", onValueChange: event => globalThis.${SINK}.push(event.text) }} />`,
  `</view>`,
].join('\n');

afterAll(() => rmSync(PROBE_OUT, { force: true }));

describe('a bare text-input tag hands the app its text', () => {
  it('calls onValueChange from the host behavior', async () => {
    writeFileSync(
      PROBE_OUT,
      compile(SOURCE, {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: 'ValueChangeProbe.svelte',
      }).js.code,
    );
    const { default: Probe } = (await import(`file://${PROBE_OUT}`)) as {
      default: Component;
    };
    mount(ROOT_TAG, Probe, {});
    await tick();
    await tick();

    // The control, asserted before the behaviour under test: a tag the engine does not resolve to
    // the single-line input commits SOMETHING, and "the callback never fired" would then read as a
    // broken behavior rather than as a probe pointed at the wrong node.
    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node, 'the tag committed a single-line input').toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: TYPED_TEXT,
      eventCount: ACK_COUNT,
    });
    await tick();
    await tick();

    expect(sink).toEqual([TYPED_TEXT]);
    unmount(ROOT_TAG);
  });
});

// Switch's twin of the file header's proof, for the same reason: `switch.ts`'s `onChange` reads
// `node.props.onValueChange` exactly like `text-input.ts`'s `callValueChange` — same fold, same
// engine routing, and the same device-only failure shape (`bare-tag-authored.test.ts`'s crash test)
// when an app writes it as an individual attribute instead of through `p={{…}}`.
const SWITCH_PROBE_OUT = join(
  __dirname,
  '.smoke-compiled-switch-value-change-probe.mjs',
);
const SWITCH_ROOT_TAG = 9_302;
const SWITCH_VIEW_NAME = 'Switch';
const REPORTED_VALUE = true;

const SWITCH_SINK = '__symbioteSwitchValueChangeSink';
const switchSink: boolean[] = [];
Object.assign(globalThis, { [SWITCH_SINK]: switchSink });

const SWITCH_TAG = HOST_PRIMITIVES.Switch.intrinsic;

const SWITCH_SOURCE = [
  `<view>`,
  `  <${SWITCH_TAG} p={{ value: false, onValueChange: event => globalThis.${SWITCH_SINK}.push(event.value) }} />`,
  `</view>`,
].join('\n');

afterAll(() => rmSync(SWITCH_PROBE_OUT, { force: true }));

describe('a bare switch tag hands the app its value', () => {
  it('calls onValueChange from the host behavior', async () => {
    writeFileSync(
      SWITCH_PROBE_OUT,
      compile(SWITCH_SOURCE, {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: 'SwitchValueChangeProbe.svelte',
      }).js.code,
    );
    const { default: Probe } = (await import(`file://${SWITCH_PROBE_OUT}`)) as {
      default: Component;
    };
    mount(SWITCH_ROOT_TAG, Probe, {});
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SWITCH_VIEW_NAME);
    expect(node, 'the tag committed a Switch').toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', {
      value: REPORTED_VALUE,
    });
    await tick();
    await tick();

    expect(switchSink).toEqual([REPORTED_VALUE]);
    unmount(SWITCH_ROOT_TAG);
  });
});
