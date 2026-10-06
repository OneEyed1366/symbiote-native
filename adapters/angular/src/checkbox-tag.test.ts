// `checkbox` как тег через рендерер Angular, вид проверяет `checkbox-payload.itest.ts`
// Число нод это оракул регистрации: без неё тег коммитит голый view без галочки
// Фикстура берёт `SYMBIOTE_ELEMENTS` без схемы, как приложение, прогон идёт JIT
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// Побочный импорт: поведение строит галочку, приложение получает его через барель пакета
import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_972;
const MAX_SETTLE_TICKS = 20;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Замер по коммитам: недостроенное дерево неотличимо от поддерева, которое поведение не построило
async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.commits;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

function hostOf(label: string): ILiveNode {
  const host = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

const values: boolean[] = [];

async function mountTemplate(template: string): Promise<void> {
  @Component({
    // Уникальный на файл: повтор селектора даёт NG0912
    selector: 'checkbox-tag-fixture',
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {
    readonly record = (event: { value: boolean }): void => {
      values.push(event.value);
    };
  }

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

async function tap(label: string): Promise<void> {
  const created = fabric.find(node => node.props.nativeID === label);
  if (created === undefined) throw new Error('no checkbox was created');
  fabric.fireEvent(created.instanceHandle, 'topTouchStart');
  await tick();
  fabric.fireEvent(created.instanceHandle, 'topTouchEnd');
  await flushUntilSettled();
}

beforeEach(() => {
  fabric.reset();
  values.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `checkbox` as a tag', () => {
  it('commits the box with the checkmark image under it', async () => {
    await mountTemplate(`<checkbox id="box" [value]="true"></checkbox>`);

    const host = hostOf('box');
    expect(host.viewName).toBe('RCTView');
    expect(host.children).toHaveLength(1);
    expect(host.children[0].viewName).toBe('RCTImageView');
  });

  it('reports the inverted value from a real touch', async () => {
    await mountTemplate(
      `<checkbox id="box" [value]="false" [onValueChange]="record"></checkbox>`,
    );

    await tap('box');

    expect(values).toEqual([true]);
  });
});
