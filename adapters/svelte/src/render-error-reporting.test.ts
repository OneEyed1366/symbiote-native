// A throw during render used to vanish. Svelte offers no mount-level hook for an UNCAUGHT error,
// so `render.ts` catches the synchronous throw out of `svelteMount` and hands it to the engine's
// reportUncaughtError; errors a `<svelte:boundary>` CLAIMS go to `dlog` instead, through svelte's
// own `transformError` mount option.
//
// Asserted through a real mount of really-compiled components, never by calling the seam
// directly: the claim is that mount() is WIRED to both paths, which is exactly what was missing.
// Harness shape (compile-to-file, unique filename per artifact because Node caches import() by
// path) is boundary.smoke.test.ts's.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

// RN sets both before any app code runs; a bare vitest sandbox has neither, and svelte's
// init_operations() reads both at first mount.
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_411;
const TMP_DIR = join(__dirname, '../build/__render_error_smoke__');
const BOOM = 'render exploded';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  unmount(ROOT_TAG);
  consoleError.mockRestore();
  consoleLog.mockRestore();
  globalThis.__SYMBIOTE_DEBUG__ = undefined;
  rmSync(TMP_DIR, { recursive: true, force: true });
  Reflect.deleteProperty(globalThis, 'ErrorUtils');
});

let compileCounter = 0;

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);

  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function') {
    throw new Error(`compiled ${name}.svelte exported no component`);
  }
  return component;
}

// root-element.ts inserts an unlabeled `symbiote-view` between the box-none AppContainer and the
// mounted component, so the app's own nodes are one level down.
function appChildren(): IFakeNode[] {
  return fabric.appRoot().children[0]?.children ?? [];
}

function joinCalls(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map(call => call.map(arg => String(arg)).join(' '));
}

function loggedMessages(): string[] {
  return joinCalls(consoleError);
}

// A throw from the component's own `<script>` — the shape a render error takes in real app code,
// and the one that unwinds a subtree svelte has already begun creating.
const EXPLODING_SOURCE =
  `<script>throw new Error('${BOOM}');</script>` +
  `<symbiote-view p={{ testID: 'never' }}></symbiote-view>`;

describe('Negative — a component throws during render, with no <svelte:boundary>', () => {
  it('reports the error instead of blanking the screen in silence', async () => {
    const Exploding = await compileComponent(EXPLODING_SOURCE, 'Exploding');

    expect(() => mount(ROOT_TAG, Exploding)).toThrow();

    expect(loggedMessages().some(message => message.includes(BOOM))).toBe(true);
  });

  it('names the render seam, so the line is not an anonymous stack', async () => {
    const Exploding = await compileComponent(EXPLODING_SOURCE, 'Exploding');

    expect(() => mount(ROOT_TAG, Exploding)).toThrow();

    expect(
      loggedMessages().some(message => message.includes('svelte render')),
    ).toBe(true);
  });

  it('routes to the host reporter when one is installed, as on a native host', async () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });
    const Exploding = await compileComponent(EXPLODING_SOURCE, 'Exploding');

    expect(() => mount(ROOT_TAG, Exploding)).toThrow();

    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining(BOOM),
    });
  });

  it('still rethrows, keeping upstream mount()’s contract with its caller', async () => {
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });
    const Exploding = await compileComponent(EXPLODING_SOURCE, 'Exploding');

    // Reporting must not swallow: an app (or the AppRegistry runnable) wrapping mount() in its
    // own try/catch has to keep seeing the failure.
    expect(() => mount(ROOT_TAG, Exploding)).toThrowError(
      expect.objectContaining({ message: expect.stringContaining(BOOM) }),
    );
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('Recovers — a <svelte:boundary> claims the error', () => {
  const GUARDED_SOURCE =
    `<script>import Child from './exploding-child.mjs';</script>` +
    `<svelte:boundary>` +
    `<Child />` +
    `{#snippet failed(error)}` +
    `<symbiote-view p={{ testID: 'failed' }}><symbiote-text p={{}}>{error.message}</symbiote-text></symbiote-view>` +
    `{/snippet}` +
    `</svelte:boundary>`;

  async function mountGuarded(): Promise<void> {
    const child = compile(EXPLODING_SOURCE, {
      generate: 'client',
      filename: 'ExplodingChild.svelte',
      fragments: 'tree',
      css: 'external',
    });
    writeFileSync(join(TMP_DIR, 'exploding-child.mjs'), child.js.code);
    const Guarded = await compileComponent(GUARDED_SOURCE, 'Guarded');

    mount(ROOT_TAG, Guarded);
    await tick();
    await tick();
  }

  it('keeps a claimed error OFF the native redbox', async () => {
    // A DELIBERATE asymmetry, mirrored from the React adapter: a boundary is the developer
    // saying "I am handling this", and a full-screen redbox over the fallback the app just
    // rendered contradicts that. The error is not swallowed — it goes to `dlog`, off unless
    // DEBUG is set. The UNCAUGHT case above still reports.
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });

    await mountGuarded();

    expect(reportError).not.toHaveBeenCalled();
    expect(loggedMessages().some(message => message.includes(BOOM))).toBe(
      false,
    );
  });

  it('lets the boundary paint its fallback all the same', async () => {
    await mountGuarded();

    expect(appChildren().map(child => child.props.testID)).toEqual(['failed']);
  });

  it('still says so on the diagnostic channel, which is where a claimed error belongs', async () => {
    // The boundary path is quiet, not blind: with DEBUG on, the claimed error is on `dlog`.
    // This is also what proves mount() is wired to svelte's `transformError` at all — every
    // other assertion in this group would pass just as well with no hook installed.
    globalThis.__SYMBIOTE_DEBUG__ = true;

    await mountGuarded();

    expect(
      joinCalls(consoleLog).some(
        message =>
          message.includes('svelte render (caught by <svelte:boundary>)') &&
          message.includes(BOOM),
      ),
    ).toBe(true);
  });

  it('hands the failed snippet the untouched error, so the tap stays read-only', async () => {
    // `transformError` can REPLACE the error svelte passes on; ours must not — the fallback has
    // to keep rendering the real message.
    await mountGuarded();

    expect(fabric.serialize(appChildren())).toBe(
      `RCTView(RCTText(RCTRawText "${BOOM}"))`,
    );
  });
});
