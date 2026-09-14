// RN parity: a ScrollView ref exposes scrollTo/scrollToEnd/flashScrollIndicators
// (`.claude/rules/adapter-parity-audit.md`'s "imperative scroll handle" surface item). The commands
// themselves are engine-level (`core/components/src/scroll-view-commands.ts`, already tested there)
// — what's Vue-specific and unproven until now is that a `ref`-held `<scroll-view>` actually hands
// back a node carrying them, mirroring the Svelte adapter's `scroll-view.smoke.test.ts`, which
// already covers this for Svelte. Vue's own `host-instance.test.ts` only proves `measure` /
// `setNativeProps` (the generic View surface) — not the ScrollView-specific commands.
//
// No Negative group: scrollTo/flashScrollIndicators take no input this adapter can reject; every
// call either reaches a committed node or (uncommitted ref) is unreachable, not a throw.
import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { isSymbioteNode } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import type { IHostInstance } from '../../host-instance';

const ROOT_TAG = 6180;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function isHostInstance(el: unknown): el is IHostInstance {
  return (
    isSymbioteNode(el) && typeof Reflect.get(el, 'scrollTo') === 'function'
  );
}

async function mountScrollRef(): Promise<IHostInstance> {
  const nodeRef = shallowRef<IHostInstance | null>(null);
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('scroll-view', {
          ref: (el: unknown) => {
            nodeRef.value = isHostInstance(el) ? el : null;
          },
        }),
    }),
  );
  await tick();
  const node = nodeRef.value;
  if (node === null) throw new Error('ref never resolved to a host instance');
  return node;
}

describe('Vue <scroll-view> imperative handle', () => {
  describe('Positive', () => {
    it('dispatches scrollTo through the ref-held host instance', async () => {
      const handle = await mountScrollRef();
      handle.scrollTo({ x: 0, y: 42, animated: false });

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('scrollTo');
      expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
      expect(fabric.commands[0]?.node.viewName).toBe('RCTScrollView');
    });

    it('dispatches flashScrollIndicators through the same handle', async () => {
      const handle = await mountScrollRef();
      handle.flashScrollIndicators();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('flashScrollIndicators');
      expect(fabric.commands[0]?.args).toEqual([]);
    });
  });
});
