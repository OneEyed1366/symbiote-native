// `activity-indicator` as a TAG, through the REAL Svelte compiler — the suite that was
// `components/activity-indicator/activity-indicator.smoke.test.ts` while a wrapper existed. RN's
// ActivityIndicator is a centering `<View>` around a native spinner (ActivityIndicator.js:112) and
// takes no children, so the wrapper's whole body was composition the engine behavior now owns
// (`core/components/src/behaviors/activity-indicator/`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike `touchable-native-feedback-tag.test.ts`'s,
// whose tag commits nothing whether or not a behavior is attached. An unregistered
// `activity-indicator` commits ONE bare RCTView with no children, so the subtree assertion fails on
// the registration alone.
//
// Labels are `id`, folded to `nativeID` — the same choice `touchable-native-feedback-tag.test.ts`
// makes: on a tag the compiler lowercases a `testID` attribute, so a `testID`-keyed locator finds
// nothing and a missing node reads as a broken fix. `nativeID` is one of the props RN moves onto the
// SPINNER (`ActivityIndicator.js:99`), so the label locates the spinner and the host is its parent.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the spinner. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-activity-indicator-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`. A measurement taken on a compiler's STOCK
// configuration is a fact about somebody else's build.
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

// RN's iOS default (`ActivityIndicator.js:25`, GRAY) and its fixed box for the named large size.
const IOS_DEFAULT_COLOR = '#999999';
const SIZE_LARGE_PX = 36;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface ICommitted {
  readonly viewName: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly ICommitted[];
}

function asCommitted(value: unknown): ICommitted | undefined {
  if (!isRecord(value) || !isRecord(value.props)) return undefined;
  const children = Array.isArray(value.children) ? value.children : [];
  return {
    viewName: value.viewName,
    props: value.props,
    children: children.flatMap(child => asCommitted(child) ?? []),
  };
}

function flatten(nodes: readonly ICommitted[]): ICommitted[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

/** The centering host, found through the spinner the label landed on. */
function hostOf(label: string): ICommitted {
  const committed = flatten(
    fabric.appRoot().children.flatMap(node => asCommitted(node) ?? []),
  );
  const spinner = committed.find(node => node.props.nativeID === label);
  if (spinner === undefined) throw new Error(`no committed spinner ${label}`);
  const host = committed.find(node => node.children.includes(spinner));
  // Unregistered, the label stays on the tag's own node and there is no parent under the root to
  // find — so this is where a missing `./register` lands, and the message says so rather than
  // reading as a broken locator.
  if (host === undefined)
    throw new Error(
      `${label} committed no spinner under a host — is the behavior registered?`,
    );
  return host;
}

let nextRoot = 9_950;

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(source: string): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, {
      ...COMPILE_OPTIONS,
      filename: 'ActivityIndicatorTag.svelte',
    }).js.code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, {});
  await settle();
  return root;
}

beforeEach(() => fabric.reset());

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `activity-indicator` as a tag', () => {
  it('commits RN’s two-node tree and folds the size onto the spinner', async () => {
    const root = await mountSource(
      `<activity-indicator id="ind" size="large"></activity-indicator>`,
    );

    // The host is the centering view and the spinner is its only child — the second node exists
    // only because the behavior built it, so this is what fails when `./register` is dropped.
    const host = hostOf('ind');
    expect(host.viewName).toBe('RCTView');
    expect(host.props).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(host.children.map(node => node.viewName)).toEqual([
      'ActivityIndicatorView',
    ]);

    // RN maps a NAMED size to both the native enum and a fixed box; the defaults have no
    // destructure to come from on a tag, so the fold is what supplies them.
    expect(host.children[0].props).toMatchObject({
      size: 'large',
      width: SIZE_LARGE_PX,
      height: SIZE_LARGE_PX,
      animating: true,
      hidesWhenStopped: true,
      color: IOS_DEFAULT_COLOR,
    });

    unmount(root);
    await settle();
  });

  // why: RN spreads `...restProps` onto the SPINNER and keeps only `onLayout`/`style` on the View
  // (ActivityIndicator.js:99,113). A prop landing on the wrong node is invisible to any assertion
  // that only checks the tree it DID reach, so both sides are pinned.
  it('routes an app prop to the spinner and keeps the style on the host', async () => {
    const root = await mountSource(
      `<activity-indicator id="ind" accessibilityLabel="loading" style={{ margin: 4 }}></activity-indicator>`,
    );

    const host = hostOf('ind');
    expect(host.props.margin).toBe(4);
    expect(Object.hasOwn(host.props, 'accessibilityLabel')).toBe(false);
    expect(host.children[0].props.accessibilityLabel).toBe('loading');

    unmount(root);
    await settle();
  });
});
