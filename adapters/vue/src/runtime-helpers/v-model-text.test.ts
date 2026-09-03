// `v-model` on a LOWERED `<TextInput>`, i.e. on an element. Device-found 2026-08-31 in
// examples/vue-sfc's canary: the field echoed keystrokes and the greeting beside it never left
// "Hello, stranger".
//
// WHY THE SUBJECT IS BUILT WITH `withDirectives` AND NOT WITH `v-model` IN A TEMPLATE. This is
// exactly what both Vue compilers emit for `v-model` on an element — measured on the real
// `compileSfc` and on `babel-jsx.cjs`, byte-for-byte the same two lines:
//
//   _withDirectives(_createElementBlock("symbiote-text-input", {
//     "onUpdate:modelValue": $event => (name.value = $event)
//   }), [[_vModelText, name.value]])
//
// A COMPONENT gets a different expansion (`modelValue` + `onUpdate:modelValue` as ordinary props),
// which is why this only became reachable when TextInput started lowering.
//
// The failure it guards is silent in the worst way: `vModelText` lives in @vue/runtime-dom, so
// before this shim existed the compiled import resolved to `undefined`, and Vue's `withDirectives`
// skips a falsy directive rather than throwing. No error, no warning — and native echoes keystrokes
// on its own, so the field looks alive while every value derived from it is frozen.
import { defineComponent, h, ref, withDirectives } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  registerTextInputBehavior,
  SWITCH_TAG,
} from '@symbiote-native/components';
import {
  clearHostBehaviors,
  createElement,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { vModelText } from './index';

const ROOT_TAG = 341;
const TEST_ID = 'model-subject';

const fabric = installFabric();
// A prop write from an event handler publishes on the microtask boundary; the render that follows
// an app-state change is queued the same way.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registerTextInputBehavior();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearHostBehaviors();
});

// The LIVE tree by testID, never `fabric.find()` — that searches `created` and hands back the
// pre-clone node with its mount-time props, so every update assertion here would read stale.
function committedProps(): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === TEST_ID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

interface IHarness {
  model: { value: string };
  node: () => ISymbioteNode;
  type: (text: string) => Promise<void>;
}

// `withDirective: false` is the CONTROL arm — the identical tree with the directive list omitted,
// which is precisely the state this shim replaced (an `undefined` directive is skipped, so the
// compiled output behaved as if it were not there). Without it a green "the value round-trips" row
// proves nothing: it cannot tell the shim working apart from something else in the stack happening
// to do the same job.
function mountModel(options: {
  initial: string;
  withDirective: boolean;
  modifiers?: Record<string, boolean>;
  onValueChange?: (text: string, event: unknown) => void;
}): IHarness {
  const model = ref(options.initial);
  let host: ISymbioteNode | null = null;

  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => {
        const props: Record<string, unknown> = {
          testID: TEST_ID,
          // The engine's own guard, not a cast: an element ref hands back whatever the renderer
          // created, and narrowing it is the discipline every host-node holder here follows.
          ref: (el: unknown) => {
            if (isSymbioteNode(el)) host = el;
          },
          'onUpdate:modelValue': (value: string) => {
            model.value = value;
          },
        };
        if (options.onValueChange !== undefined)
          props.onValueChange = options.onValueChange;
        const vnode = h('symbiote-text-input', props);
        return options.withDirective
          ? withDirectives(vnode, [
              [vModelText, model.value, undefined, options.modifiers ?? {}],
            ])
          : vnode;
      },
    }),
  );

  const node = (): ISymbioteNode => {
    if (host === null) throw new Error('the host element ref never resolved');
    return host;
  };

  return {
    model,
    node,
    // The native beat: RN fires `change` per keystroke and the machine owns that listener.
    type: async (text: string) => {
      const listener = node().listeners?.get('change');
      if (listener === undefined)
        throw new Error('no "change" listener — the behavior did not attach');
      listener({ nativeEvent: { text, eventCount: 1 } });
      await tick();
    },
  };
}

describe('v-model on a lowered TextInput', () => {
  // The two halves of a two-way binding, asserted separately because one can work without the
  // other: the value going down is a prop write, the text coming back is the machine's fold.
  it('sends the model value down as the committed text', async () => {
    mountModel({ initial: 'start', withDirective: true });
    await tick();

    // `value` -> `text` is the engine's own fold in fabricProps, so the payload names `text`.
    expect(committedProps()).toMatchObject({ text: 'start' });
  });

  it('assigns the typed text back into the model', async () => {
    const harness = mountModel({ initial: 'start', withDirective: true });
    await tick();

    await harness.type('typed');

    expect(harness.model.value).toBe('typed');
    expect(committedProps()).toMatchObject({ text: 'typed' });
  });

  // THE CONTROL. Same tree, no directive — the exact shape that shipped before this shim. It must
  // NOT round-trip, or the two rows above are passing for a reason that has nothing to do with
  // vModelText.
  it('does not round-trip without the directive, which is what the defect looked like', async () => {
    const harness = mountModel({ initial: 'start', withDirective: false });
    await tick();

    await harness.type('typed');

    expect(harness.model.value).toBe('start');
    expect(committedProps()?.text).toBeUndefined();
  });

  // On the COMPONENT path the wrapper emits `valueChange` AND `update:modelValue`, so an app may
  // legitimately bind both. Lowering must not make them exclusive — the directive owns the one
  // `onValueChange` slot the machine reads, so it has to call whatever the app put there first.
  it('keeps the app own onValueChange working beside v-model', async () => {
    const onValueChange = vi.fn();
    const harness = mountModel({
      initial: 'start',
      withDirective: true,
      onValueChange,
    });
    await tick();

    await harness.type('typed');

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0][0]).toBe('typed');
    expect(harness.model.value).toBe('typed');
  });

  it('applies the trim modifier to the assigned value', async () => {
    const harness = mountModel({
      initial: '',
      withDirective: true,
      modifiers: { trim: true },
    });
    await tick();

    await harness.type('  padded  ');

    expect(harness.model.value).toBe('padded');
  });
});

// Vue's compiler picks the v-model directive by ELEMENT, and for anything it does not recognise as
// a DOM input it emits `vModelText` — a lowered `<symbiote-switch>` included. Stringifying the
// model there is correct upstream (a DOM input's value IS a string) and fatal here: the Switch
// behavior reads `props.value === true`, so `String(true)` pins the control OFF and no tap moves
// it. Device-confirmed on `examples/vue-sfc`, both switches on `CanaryScreen`, 2026-09-02.
describe('vModelText on a lowered switch', () => {
  const created = (value: unknown): ISymbioteNode => {
    const el = createElement('Switch', false, SWITCH_TAG);
    vModelText.created?.(
      el,
      { value, modifiers: {} } as never,
      { props: { 'onUpdate:modelValue': () => {} } } as never,
      null as never,
    );
    return el;
  };

  it('writes the boolean the behavior actually reads', () => {
    expect(created(true).props.value).toBe(true);
    expect(created(false).props.value).toBe(false);
  });

  // The control that keeps the branch honest: a text input must still be stringified, which is
  // what every other row in this file rests on.
  it('still stringifies for a text input', () => {
    const el = createElement(
      'RCTSinglelineTextInputView',
      false,
      'symbiote-text-input',
    );
    vModelText.created?.(
      el,
      { value: 42, modifiers: {} } as never,
      { props: { 'onUpdate:modelValue': () => {} } } as never,
      null as never,
    );
    expect(el.props.value).toBe('42');
  });
});
