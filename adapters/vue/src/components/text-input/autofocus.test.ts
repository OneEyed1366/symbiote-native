// Co-located Vue-driven test: TextInput autoFocus. autoFocus is a JS-driven imperative
// `focus` view command fired once the node first commits (RN TextInputState.focusInput). The Vue
// adapter wires it from a watch(nodeRef, …, flush:'post'), but under the async-batched commit the
// node has no Fabric tag at post-flush time, so a naive dispatchViewCommand is skipped (node not
// committed) and the one-shot guard never lets it retry — autoFocus silently does nothing on Vue
// (React commits synchronously, so its effect always sees the committed node). The fake fabric slot
// records dispatched commands so we assert the focus actually reached the committed node, no host.
//
// Unit under test: the `watch(nodeRef, …, {flush:'post'})` + `whenCommitted(node, …)` pair in
// adapters/vue/src/components/text-input/index.ts (see `<vue-adapter-reactivity>` Gotcha 2). The
// scenario below proves the RETRY itself, not just the eventual outcome: at the moment the
// post-flush watch fires, Vue's own commit (queueMicrotask'd requestCommit) has not run yet, so the
// node has no Fabric tag — dispatchViewCommand would be a silent no-op on a naive read. Only
// whenCommitted's deferred retry, run from the post-commit hook once the tag is assigned, gets the
// command through — proven by asserting NO focus command exists synchronously after mount, and
// exactly one exists only after the tick that lets the commit (and its post-commit hook) run.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, TextInput } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');

const commands: ICommandCall[] = [];
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const ROOT_TAG = 53;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function focusCommands(): ICommandCall[] {
  return commands.filter(command => command.name === 'focus');
}

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue TextInput autoFocus', () => {
  describe('Positive (the focus command reaches the node once it is actually committed)', () => {
    it('does not dispatch focus synchronously, before Vue has committed the node', () => {
      // why: proves the retry path is load-bearing, not incidental — at mount() return, Vue's
      // requestCommit() microtask (and thus the Fabric tag) has not run yet, so a naive
      // dispatchViewCommand at this point would have nothing to target. If this ever starts
      // passing with a command already present, autoFocus stopped depending on whenCommitted and
      // this regression guard is no longer proving what it claims to.
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () => h(TextInput, { autoFocus: true }),
        }),
      );

      expect(
        focusCommands(),
        'no focus command before the commit microtask runs',
      ).toHaveLength(0);
    });

    it('dispatches the focus command to the committed node once whenCommitted retries after commit', async () => {
      // why: the actual regression this file guards — autoFocus must survive Vue's async-batched
      // commit via whenCommitted's post-commit retry (React needs no retry, its commit is sync).
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () => h(TextInput, { autoFocus: true }),
        }),
      );
      await tick();

      expect(
        focusCommands(),
        'autoFocus dispatches exactly one focus command',
      ).toHaveLength(1);
    });

    it('does not focus when autoFocus is absent', async () => {
      // why: autoFocus must be opt-in — a plain TextInput must never steal focus from whatever the
      // app already focused.
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () => h(TextInput, {}),
        }),
      );
      await tick();

      expect(focusCommands()).toHaveLength(0);
    });
  });
});
