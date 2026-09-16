// Regression for a device-reported no-op (2026-09-11): "flash the right chip" — a button whose
// handler reads a `useTemplateRef()` target and calls `setNativeProps` on it — silently did
// nothing, with a dev-only "[Vue warn] Set operation on key … failed: target is readonly."
//
// Root cause: `useTemplateRef()` (Vue 3.5+) returns `readonly(shallowRef(null))`
// (runtime-core.cjs.js). Vue's `readonly()` wraps ANY value whose
// `Object.prototype.toString.call(value) === '[object Object]'` — true of a plain class instance
// like SymbioteNode, unlike a real DOM Element, which fails that check for free
// (`[object HTMLDivElement]`) and is therefore never wrapped in real Vue DOM apps. A PLAIN
// `ref()`/`shallowRef()` bound via `ref="x"` (CanaryScreen's Teleport target, create-portal's
// tests) never hits this — only `useTemplateRef()`'s deep-readonly wrapper does, so this bug is
// invisible to every existing ref test in this adapter.
//
// Fixed in renderer/index.ts: `createElement` calls `markRaw(node)` before handing it to Vue,
// which sets a permanent, non-enumerable `__v_skip` flag that exempts the node from ANY future
// Vue reactivity wrap (reactive/readonly/shallowReactive/shallowReadonly), regardless of which
// ref API reaches it.
//
// Driven through the real compiler (compileSfc) and a real press dispatch, per this repo's own
// discipline: a hand-built `h(..., {ref: useTemplateRef(...)})` would not prove the SFC's actual
// codegen reaches the same object, and a direct call to the handler would not prove the press
// path is what a device exercises.

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  waitUntil,
} from '@symbiote-native/test-utils';
import * as engine from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import type { ILiveNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import * as runtimeHelpers from './runtime-helpers';
import metroVueTransformer from '../metro-vue-transformer.cjs';

const ROOT_TAG = 899;
const FLASH_COLOR = '#ff0000';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function moduleRequire(specifier: string): unknown {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  throw new Error(
    `compiled SFC required an unexpected specifier: ${specifier}`,
  );
}

function evaluateCompiledSfc(code: string): unknown {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const evaluated: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', outputText);
  factory(moduleRequire, evaluated, evaluated.exports);
  return evaluated.exports.default;
}

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

function committed(testId: string): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testId,
  );
  expect(found, `"${testId}" is in the committed tree`).toBeDefined();
  if (found === undefined) throw new Error('unreachable');
  return found;
}

describe('useTemplateRef() target — not swept into Vue reactivity', () => {
  it('a setNativeProps write through the ref reaches the committed node', async () => {
    const source = `
      <script setup lang="ts">
      import { useTemplateRef } from 'vue';
      import type { IHostInstance } from '@symbiote-native/vue';
      import { setNativeProps, whenCommitted } from '@symbiote-native/engine';
      const target = useTemplateRef<IHostInstance>('target');
      function flash(): void {
        const node = target.value;
        if (!node) return;
        whenCommitted(node, () =>
          setNativeProps(node, { style: { backgroundColor: '${FLASH_COLOR}' } }),
        );
      }
      </script>
      <template>
        <view>
          <view ref="target" testID="chip" />
          <pressable testID="flash-btn" :onPress="flash" />
        </view>
      </template>
    `;
    const code = await compileSfc(source, 'HostRefNotReactiveProbe.vue');
    mount(ROOT_TAG, evaluateCompiledSfc(code) as never);
    await waitUntil(() => fabric.commits > 0, 'first commit');

    const btn = committed('flash-btn');
    fabric.fireEvent(btn.instanceHandle, 'topTouchStart');
    fabric.fireEvent(btn.instanceHandle, 'topTouchEnd');
    await tick();
    await tick();

    expect(committed('chip').payload.backgroundColor).toBe(FLASH_COLOR);

    unmount(ROOT_TAG);
  });
});
