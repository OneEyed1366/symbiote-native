// Svelte half of StatusBar compiled from the real index.svelte: props reach native through the
// engine stack and destroying the component restores what the stack held below it
// Native call shapes are the engine's, covered in core/engine/src/status-bar

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_201;
const STATUS_BAR_OUT = join(__dirname, '.smoke-compiled-status-bar.mjs');

type IStyleCall = { style: string; animated: boolean };

let styleCalls: IStyleCall[] = [];

const fakeStatusBarManager = {
  setStyle: (style: string, animated: boolean): void => {
    styleCalls.push({ style, animated });
  },
  setHidden: (): void => {},
  setNetworkActivityIndicatorVisible: (): void => {},
};

const registeredModules: Record<string, unknown> = {
  StatusBarManager: fakeStatusBarManager,
};

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isType<T>(module) ? module : null;
  },
});

const fabric = installRecordingFabric();

// Effects run on a microtask and the stack sends from `setImmediate` queued by them, so wait both
const frame = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setImmediate(resolve));
};

async function compileStatusBar(): Promise<Component> {
  const source = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  const result = compile(source, {
    generate: 'client',
    fragments: 'tree',
    css: 'external',
    filename: 'StatusBar.svelte',
  });
  writeFileSync(STATUS_BAR_OUT, result.js.code);
  const mod: unknown = await import(`file://${STATUS_BAR_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('StatusBar.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
  styleCalls = [];
});

afterEach(async () => {
  unmount(ROOT_TAG);
  await frame();
  rmSync(STATUS_BAR_OUT, { force: true });
});

describe('Svelte StatusBar', () => {
  it('applies its props on mount', async () => {
    const StatusBar = await compileStatusBar();

    mount(ROOT_TAG, StatusBar, { barStyle: 'light-content' });
    await frame();

    expect(styleCalls).toEqual([{ style: 'light-content', animated: false }]);
  });

  it('restores the defaults when the component is destroyed', async () => {
    const StatusBar = await compileStatusBar();
    mount(ROOT_TAG, StatusBar, { barStyle: 'dark-content' });
    await frame();
    styleCalls = [];

    unmount(ROOT_TAG);
    await frame();

    expect(styleCalls).toEqual([{ style: 'default', animated: false }]);
  });
});
