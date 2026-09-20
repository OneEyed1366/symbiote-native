// The controlled `<text-input>` write-back handshake, driven through the REAL Vue renderer against
// the REAL committed Fabric tree — the ONE case of
// adapters/vue/src/controlled-input-keeps-its-beat.test.ts that genuinely needs a real tag. The
// file's other case ("still writes a value the app changes") needed no tag at all and converted to
// `installRecordingFabric()` in place; this is the split, not a whole-file move.
//
// The write-back is driven by `requestCommitFor`, which routes the recommit through
// `committedRecordOf(node).rootTag` — every node on the recording host answers the same `NO_TAG`
// sentinel for `rootTag`, so the routed commit finds no matching surface and the command never
// fires; the recording host cannot model per-surface tag identity by design. What was ALSO missing
// until now: the itest harness had no way to observe a DISPATCHED COMMAND at all —
// `nativeFabricUIManager.dispatchCommand` reaches `UIManager::dispatchCommand`, which only forwards
// to a delegate if one is installed, and none was. Added a `CommandRecorder` (`symbiote-host.h`)
// implementing the one `UIManagerDelegate` hook this needs, wired through a new `commands()` JSI
// binding (`symbiote-tester.cpp`) and harness reader (`harness.ts`) — the other thirteen delegate
// methods are transaction/mounting notifications this Host's own polling-based `mount()` does not
// use, so they are safe no-ops.
//
// Guard under test: `@vue/runtime-core` patches `value` unconditionally on a DOM `<input>` —
// excluded from its own diff, then patched on its own line, a DOM workaround (typing mutates
// `el.value` directly). Upstream balances it with a guard in `patchDOMProp`; this renderer had the
// unconditional call and not the guard, so every `<text-input>` re-routed its value on every
// re-render of its parent. The guard is `key !== 'value' || prev !== next` in `renderer/index.ts`.

import {
  defineComponent,
  h,
  mount,
  ref,
  unmount,
  type VNode,
} from '@symbiote-native/vue';
import { registerTextInputBehavior } from '@symbiote-native/components';

import {
  commands,
  describe,
  dispatchEvent,
  expect,
  findCommitted,
  flushTimers,
  it,
  report,
} from './harness';

registerTextInputBehavior();

const ROOT_TAG = 1;
const BOUND_VALUE = 'bound by the app';
const TYPED_VALUE = 'what the user typed';
// The count native reports back on a keystroke — a number nothing else here produces, so the
// command's first argument cannot match by accident.
const NATIVE_EVENT_COUNT = 11;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

const boundValueRef = ref(BOUND_VALUE);
// Something on the SURROUNDING markup, so a re-render can touch the tree without touching the
// input — the shape that used to re-route the input's value anyway.
const siblingLabelRef = ref('before');

const Screen = defineComponent({
  name: 'controlled-input-screen',
  setup() {
    return (): VNode =>
      h('view', null, [
        h('text', null, siblingLabelRef.value),
        h('text-input', { value: boundValueRef.value }),
      ]);
  },
});

function commandsNamed(name: string): ReturnType<typeof commands> {
  return commands().filter(entry => entry.commandName === name);
}

describe('a controlled text input under the vue renderer, on the real engine', () => {
  // The whole handshake, end to end: native reports the user's text, and the app's own value —
  // which never changed — is commanded back down with native's acknowledged count.
  it('commands the bound value back after the user types', async () => {
    boundValueRef.value = BOUND_VALUE;
    siblingLabelRef.value = 'before';

    const surface = mount(ROOT_TAG, Screen);
    await tick();
    surface.commit();
    await tick();

    const input = findCommitted(n => n.viewName.includes('TextInput'));
    expect(input !== undefined).toBe(true);
    if (input === undefined) throw new Error('unreachable: text input missing');

    // Fire the native event the way the platform does, at the real committed tag — no fake slot.
    dispatchEvent(input.tag, 'topChange', {
      text: TYPED_VALUE,
      eventCount: NATIVE_EVENT_COUNT,
    });
    await tick();
    surface.commit();
    await tick();

    const commanded = commandsNamed('setTextAndSelection');
    expect(commanded.length).toBe(1);
    expect(commanded[0].args).toEqual([
      NATIVE_EVENT_COUNT,
      BOUND_VALUE,
      -1,
      -1,
    ]);
    unmount(ROOT_TAG);
  });
});

report();
