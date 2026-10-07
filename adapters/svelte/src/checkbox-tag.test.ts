// `checkbox` как тег через настоящий компилятор Svelte, вид проверяет `checkbox-payload.itest.ts`
// Число нод это оракул регистрации: без неё тег коммитит голый view без галочки
// Локатор по `id` (он сворачивается в `nativeID`), компилятор переводит `testID` в нижний регистр
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// Побочный импорт: поведение строит галочку и ведёт жест нажатия
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Свой артефакт на сьют: два сьюта с общим файлом гоняются при полном прогоне
const PROBE_OUT = join(__dirname, '.smoke-compiled-checkbox-tag.mjs');

// Копия настроек `metro-svelte-transformer.cjs`, стоковая конфигурация компилятора это чужая сборка
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

function hostOf(label: string): ILiveNode {
  const host = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

let nextRoot = 9_980;

async function mountSource(source: string): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'CheckboxTag.svelte' }).js
      .code,
  );
  // Динамический import кешируется по пути, без нового query повторится модуль прошлого кейса
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, {});
  await settle();
  return root;
}

async function tap(label: string): Promise<void> {
  const created = fabric.find(node => node.props.nativeID === label);
  if (created === undefined) throw new Error('no checkbox was created');
  fabric.fireEvent(created.instanceHandle, 'topTouchStart');
  await tick();
  fabric.fireEvent(created.instanceHandle, 'topTouchEnd');
  await settle();
}

beforeEach(() => {
  fabric.reset();
  Reflect.set(globalThis, 'checkboxValues', []);
});

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `checkbox` as a tag', () => {
  it('commits the box with the checkmark image under it', async () => {
    const root = await mountSource(
      `<checkbox p={{ id: 'box', value: true }}></checkbox>`,
    );

    const host = hostOf('box');
    expect(host.viewName).toBe('RCTView');
    expect(host.children).toHaveLength(1);
    expect(host.children[0].viewName).toBe('RCTImageView');

    unmount(root);
    await settle();
  });

  it('reports the inverted value from a real touch', async () => {
    const root = await mountSource(
      `<checkbox p={{ id: 'box', value: false, onValueChange: event => globalThis.checkboxValues.push(event.value) }}></checkbox>`,
    );

    await tap('box');

    expect(Reflect.get(globalThis, 'checkboxValues')).toEqual([true]);

    unmount(root);
    await settle();
  });
});
