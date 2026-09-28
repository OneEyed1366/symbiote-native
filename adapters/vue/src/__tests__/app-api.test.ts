// Ground-truth check for the App API surface (app.component/app.directive/app.provide,
// resolveComponent/resolveDirective by registered string name): real Vue apps lean on
// this heavily, and it was never directly exercised by this suite before.

import {
  defineComponent,
  h,
  inject,
  resolveComponent,
  resolveDirective,
  withDirectives,
  type ObjectDirective,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, setAppConfigurator, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 724;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  setAppConfigurator(undefined);
});

describe('app.component + resolveComponent by registered string name', () => {
  it('resolves a globally registered component in the template', async () => {
    const Named = defineComponent({ render: () => h('text', null, 'named') });
    setAppConfigurator(app => app.component('Named', Named));

    const App = defineComponent({
      render(): VNode {
        return h(resolveComponent('Named'));
      },
    });
    mount(ROOT_TAG, App);
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['named']);
  });
});

describe('app.directive + resolveDirective by registered string name', () => {
  it('resolves a globally registered directive', async () => {
    const calls: unknown[] = [];
    const directive: ObjectDirective<unknown, string> = {
      mounted: (_el, { value }) => calls.push(value),
    };
    setAppConfigurator(app => app.directive('mydir', directive));

    const App = defineComponent({
      render(): VNode {
        return withDirectives(h('view'), [[resolveDirective('mydir'), 'x']]);
      },
    });
    mount(ROOT_TAG, App);
    await tick();
    expect(calls).toEqual(['x']);
  });
});

describe('app.provide + inject', () => {
  it('injects a value provided at the app level', async () => {
    setAppConfigurator(app => app.provide('greeting', 'hello from app'));

    const Child = defineComponent({
      setup() {
        const greeting = inject('greeting', 'missing');
        return () => h('text', null, greeting);
      },
    });
    const App = defineComponent({ render: () => h(Child) });
    mount(ROOT_TAG, App);
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['hello from app']);
  });
});
