// The seven microseconds, taken apart.
//
// why: §18s put 7.0 of a tagged node's 8.0 us inside ONE function — the `text-input` behavior's own
// `attach` — which is ~52% of the whole create phase, from a function we own. The engine's half of
// attaching is 0.31. Nothing else measured in this investigation is within an order of magnitude, so
// this is the last thing left to split and the first one worth splitting.
//
// WHAT `attach` ACTUALLY DOES (`core/components/src/behaviors/text-input.ts:342`):
//
//   states.set(node, {…})                    a WeakMap set plus two object allocations
//   setProp(node, 'mostRecentEventCount', 0) a prop write, and a prop write is 0.56 us (§18n)
//   4 x setBehaviorListener(…)               four fresh closures, four Map writes
//   attachPressMachine(node, {…})            a Set, a runtime, a host object of four closures, a
//                                            nine-field state object, a second WeakMap set, and
//                                            SEVEN more `setBehaviorListener` calls
//
// So a `<TextInput>` installs **eleven listeners**, each with its own closure. None of the eleven is
// in `GATED_EVENT_PROPS`, so none of them fires the extra `setProp` that would otherwise multiply
// the cost — checked rather than assumed, because that was the first guess.
//
// FIVE SYNTHETIC BEHAVIORS, each a strict superset of the one before, registered under its own tag
// and built from the ENGINE's own exported functions. Four subtractions then name every part.
//
// ALL ARMS IN ONE CASE, and the gates are STRUCTURAL rather than comparative. Four fixtures written
// this week learned the same thing the hard way: a timing comparison inside a 117-process suite is a
// print, read from a solo invocation (§11, §18h). What is asserted here instead is that each rung
// installed what it was supposed to install — load-proof, and the only way to know the ladder is a
// ladder at all.
//
// RUN WITH `SYMBIOTE_ITEST_BYTECODE=1` on `bench:itest` (§21).

import {
  createElement,
  registerHostBehavior,
  setBehaviorListener,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
// Reached by source path rather than a package subpath: the press machine is not on the components
// package's public surface, and the harness's resolver maps `@symbiote-native/<pkg>/<path>` straight
// onto `core/<pkg>/src/<path>`. A test may look inside; production may not.
import { attachPressMachine } from '@symbiote-native/components/behaviors/pressable';
import { registerTextInputBehavior } from '@symbiote-native/components';

import { describe, expect, it, print, report } from './harness';

/** A thousand-row create's worth of inputs — far more than a row has, so the per-node figure is clean. */
const NODES = 10_000;
const SAMPLES = 5;

/** The four names `text-input`'s own `attach` wires, before the press machine adds seven more. */
const INPUT_EVENTS = ['change', 'focus', 'blur', 'selectionChange'];
/** What the press machine installs on top — `KEY_BY_EVENT` in `behaviors/pressable.ts`. */
const PRESS_EVENTS = 7;

/** Best of `SAMPLES`, buffer drained around each so no arm inherits the last one's tables (§10). */
function best(run: () => void, after?: () => void): number {
  let lowest = Infinity;
  for (let at = 0; at < SAMPLES; at += 1) {
    takeBatch();
    const startedAt = performance.now();
    run();
    lowest = Math.min(lowest, performance.now() - startedAt);
    after?.();
    takeBatch();
  }
  return lowest;
}

/** Kept live so the imitated press host's closures capture something and cannot be folded away. */
let machineSink = 0;

/** What one `setBehaviorListener` costs on its own — set by the closure case, read by the last one. */
let perInstall = 0;

/** The state object `text-input`'s `attach` builds, field for field. */
function makeState(): object {
  return {
    mostRecentEventCount: 0,
    lastNativeText: undefined,
    isFocused: false,
    isMirrorFreshlySeeded: false,
    lastNativeSelection: { start: -1, end: -1 },
  };
}

describe('what a text-input behavior spends its eight microseconds on', () => {
  // why: THE SPLIT §18s asked for. Five rungs, each adding exactly one thing the real `attach` does,
  // so four subtractions attribute all of it — and the last rung should land on the real behavior's
  // own reading, which is the check that the imitation is faithful.
  it('installs eleven listeners, and that is where the time goes', () => {
    const sink: ISymbioteNode[] = [];
    const drop = (): void => {
      sink.length = 0;
    };
    const states = new WeakMap<object, object>();

    registerHostBehavior('bench-b0', { attach(): void {}, detach(): void {} });
    registerHostBehavior('bench-b1', {
      attach(node): void {
        states.set(node, makeState());
      },
      detach(): void {},
    });
    registerHostBehavior('bench-b2', {
      attach(node): void {
        states.set(node, makeState());
        setProp(node, 'mostRecentEventCount', 0);
      },
      detach(): void {},
    });
    registerHostBehavior('bench-b3', {
      attach(node): void {
        states.set(node, makeState());
        setProp(node, 'mostRecentEventCount', 0);
        for (const event of INPUT_EVENTS) {
          setBehaviorListener(node, event, () => undefined);
        }
      },
      detach(): void {},
    });
    registerHostBehavior('bench-b4', {
      attach(node): void {
        states.set(node, makeState());
        setProp(node, 'mostRecentEventCount', 0);
        for (const event of INPUT_EVENTS) {
          setBehaviorListener(node, event, () => undefined);
        }
        attachPressMachine(node, {});
      },
      detach(): void {},
    });
    // THE PRESS MACHINE'S BODY WITHOUT ITS LISTENERS, imitated field for field from `attach` in
    // `behaviors/pressable.ts:380` — a timer `Set`, the twelve-field runtime, the host object with
    // its four closures, the nine-field state, and the second `WeakMap` entry. `installListeners` is
    // the one thing left out, so `b4 - b5` is the seven listeners and `b5 - b3` is everything else
    // the machine builds. Without this rung the 3.9 us has no interior at all.
    const machineStates = new WeakMap<object, object>();
    registerHostBehavior('bench-b5', {
      attach(node): void {
        states.set(node, makeState());
        setProp(node, 'mostRecentEventCount', 0);
        for (const event of INPUT_EVENTS) {
          setBehaviorListener(node, event, () => undefined);
        }
        const timers = new Set<number>();
        const runtime = {
          longPressCancel: undefined,
          longPressFired: false,
          pressDelayCancel: undefined,
          pressOutCancel: undefined,
          pressOrigin: undefined,
          activatePosition: undefined,
          driftedOut: false,
          region: undefined,
          active: false,
          activatedAt: undefined,
          delayElapsed: false,
          disposed: false,
        };
        const host = {
          setPressed: (pressed: boolean) => {
            machineSink += pressed ? 1 : 0;
          },
          getMeasureFn: () => (callback: unknown) => {
            machineSink += callback === undefined ? 0 : 1;
          },
          schedule: (callback: unknown, ms: number) => {
            machineSink += ms + (callback === undefined ? 0 : 1);
            return () => {
              timers.clear();
            };
          },
          now: Date.now,
        };
        machineStates.set(node, {
          runtime,
          host,
          refine: undefined,
          disabledOf: undefined,
          source: node,
          timers,
          listeners: {},
          isBuilt: false,
        });
      },
      detach(): void {},
    });
    registerTextInputBehavior();

    const arm = (tag: string, component = 'RCTView'): number =>
      best(() => {
        for (let at = 0; at < NODES; at += 1) {
          sink.push(createElement(component, false, tag));
        }
      }, drop);

    // DISCARDED: the first arm in a process pays a cold allocator and every lazy module binding the
    // bundle carries — and it would land on the baseline every other number is read against.
    arm('bench-b0');

    const b0 = arm('bench-b0');
    const b1 = arm('bench-b1');
    const b2 = arm('bench-b2');
    const b3 = arm('bench-b3');
    const b5 = arm('bench-b5');
    const b4 = arm('bench-b4');
    const real = arm('text-input', 'RCTSinglelineTextInputView');
    if (machineSink === -1)
      throw new Error('unreachable, and it keeps the captures live');

    // ONE NODE OF EACH, kept for the structural gate below. Built outside every clock.
    const built = new Map<string, ISymbioteNode>();
    for (const tag of ['bench-b0', 'bench-b3', 'bench-b4']) {
      built.set(tag, createElement('RCTView', false, tag));
    }
    takeBatch();

    const each = (wall: number): number => (wall * 1_000) / NODES;
    print(
      `DEBUG ATTACHLADDER empty ${each(b0).toFixed(3)} us · ` +
        `+state ${each(b1).toFixed(3)} · +setProp ${each(b2).toFixed(3)} · ` +
        `+4 listeners ${each(b3).toFixed(3)} · +press machine ${each(b4).toFixed(3)} · ` +
        `the real behavior ${each(real).toFixed(3)} us`,
    );
    print(
      `DEBUG ATTACHLADDER deltas  state ${each(b1 - b0).toFixed(3)} · ` +
        `setProp ${each(b2 - b1).toFixed(3)} · ` +
        `4 listeners ${each(b3 - b2).toFixed(3)} (${each((b3 - b2) / INPUT_EVENTS.length).toFixed(3)} each) · ` +
        `press machine ${each(b4 - b3).toFixed(3)} · ` +
        `imitation vs real ${each(real - b4).toFixed(3)}`,
    );
    print(
      `DEBUG ATTACHLADDER machine  its objects ${each(b5 - b3).toFixed(3)} us · ` +
        `its seven listeners ${each(b4 - b5).toFixed(3)} us ` +
        `(${each((b4 - b5) / PRESS_EVENTS).toFixed(3)} each)`,
    );

    // THE STRUCTURAL GATES, which no machine load can overturn and which are the only way to know
    // the rungs are what they claim: each must have installed exactly the listeners it names. An arm
    // whose tag failed to register — the failure that made §18r's timing gate pass its own
    // break-test — lands here instead of in a print.
    expect(built.get('bench-b0')?.listeners?.size ?? 0).toBe(0);
    expect(built.get('bench-b3')?.listeners?.size ?? 0).toBe(
      INPUT_EVENTS.length,
    );
    expect(built.get('bench-b4')?.listeners?.size ?? 0).toBe(
      INPUT_EVENTS.length + PRESS_EVENTS,
    );
  });

  // why: 0.20 us PER LISTENER times eleven is 2.2 us of the eight, and the press machine's seven are
  // seven distinct arrow closures that differ only by the `key` they pass to one shared `dispatch`
  // (`installListeners` in `behaviors/pressable.ts`). If the closure is most of that 0.20, a single
  // shared dispatcher reading the key off the event would save six allocations per input; if the
  // `Map` write is, it would save nothing and the idea is dead before anyone writes it.
  //
  // BOTH ARMS IN THIS CASE, install for install, so the only difference is where the function came
  // from (§11 — a comparison across cases inside a 117-process suite compares two machine loads).
  it('pays more for a fresh closure per listener than for a shared one', () => {
    const nodes: ISymbioteNode[] = [];
    for (let at = 0; at < NODES; at += 1) nodes.push(createElement('RCTView'));
    const names = [...INPUT_EVENTS, 'press', 'pressIn', 'pressOut'];
    const shared = (): undefined => undefined;

    // THE FRESH ARM CAPTURES, and the first draft of this case did not — which understated it and
    // would have sent the verdict the wrong way. `() => undefined` closes over nothing, so the
    // optimizer is free to hand back ONE function object for every iteration of the loop; the press
    // machine's dispatchers close over `node` and their key, which forces a real environment per
    // listener. **An arm has to be the shape production has, not the cheapest shape that
    // type-checks** (§18l).
    let sink = 0;
    const install = (fresh: boolean): number =>
      best(() => {
        for (const node of nodes) {
          for (const name of names) {
            setBehaviorListener(
              node,
              name,
              fresh
                ? () => {
                    sink += node.listeners === undefined ? 0 : name.length;
                  }
                : shared,
            );
          }
        }
      });

    // DISCARDED: the first arm pays the `node.listeners ??= new Map()` on every one of the ten
    // thousand nodes, and that allocation happens once per node for the whole case.
    install(false);

    const sharedWall = install(false);
    const freshWall = install(true);
    const installs = NODES * names.length;
    const each = (wall: number): number => (wall * 1_000) / installs;
    print(
      `DEBUG LISTENER shared ${each(sharedWall).toFixed(3)} us · ` +
        `fresh ${each(freshWall).toFixed(3)} us · ` +
        `the closure costs ${each(freshWall - sharedWall).toFixed(3)} us over ${installs} installs`,
    );

    if (sink === -1)
      throw new Error('unreachable, and it keeps the capture live');

    // STRUCTURAL, not comparative: every name must actually be standing on every node. An arm whose
    // loop was hoisted or whose `setBehaviorListener` became a no-op lands here, and no machine load
    // can overturn it (§11, §18h).
    expect(nodes[0]?.listeners?.size ?? 0).toBe(names.length);
    perInstall = each(freshWall);
    expect(nodes[NODES - 1]?.listeners?.size ?? 0).toBe(names.length);
  });

  // why: THE 2.7x THAT DOES NOT ADD UP. A `setBehaviorListener` costs 0.127 us measured on its own,
  // and the press machine's seven cost 0.345 each. The install cannot be dearer inside a loop than
  // outside one — so the difference is the LOOP, and `installListeners`
  // (`behaviors/pressable.ts:343`) iterates a `Map` and destructures every entry:
  //
  //   for (const [event, key] of KEY_BY_EVENT) …
  //
  // A `Map` iterator yields a fresh two-element ARRAY per step, and the destructuring reads it back
  // — seven array allocations plus seven iterator steps per input, for a table of seven fixed pairs
  // that never changes. A pair of plain arrays would allocate nothing.
  //
  // BOTH ARMS IN THIS CASE, same shape, same body, only the container differs.
  it('pays for iterating a Map where a plain array would do', () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['press', 'onPress'],
      ['pressIn', 'onPressIn'],
      ['pressOut', 'onPressOut'],
      ['startShouldSetResponder', 'onStartShouldSetResponder'],
      ['responderMove', 'onResponderMove'],
      ['responderTerminationRequest', 'onResponderTerminationRequest'],
      ['responderGrant', 'onResponderGrant'],
    ];
    const asMap: ReadonlyMap<string, string> = new Map(pairs);
    const events = pairs.map(pair => pair[0]);
    const keys = pairs.map(pair => pair[1]);
    const ROUNDS = 10_000;

    let sink = 0;
    const mapWall = best(() => {
      for (let at = 0; at < ROUNDS; at += 1) {
        for (const [event, key] of asMap) sink += event.length + key.length;
      }
    });
    const arrayWall = best(() => {
      for (let at = 0; at < ROUNDS; at += 1) {
        for (let index = 0; index < events.length; index += 1) {
          sink += (events[index]?.length ?? 0) + (keys[index]?.length ?? 0);
        }
      }
    });

    // THE THIRD SHAPE, and the one worth having if it is cheap: an array of TUPLES keeps the pairing
    // that two parallel arrays give up, and the tuples already exist — destructuring them allocates
    // nothing per step, unlike a `Map` iterator which builds the pair as it goes.
    const tupleWall = best(() => {
      for (let at = 0; at < ROUNDS; at += 1) {
        for (const [event, key] of pairs) sink += event.length + key.length;
      }
    });

    const each = (wall: number): number => (wall * 1_000) / ROUNDS;
    print(
      `DEBUG MAPITER map+destructure ${each(mapWall).toFixed(3)} us · ` +
        `two arrays ${each(arrayWall).toFixed(3)} us · ` +
        `array of tuples ${each(tupleWall).toFixed(3)} us · ` +
        `map saving ${each(mapWall - tupleWall).toFixed(3)} us per input over ${PRESS_EVENTS} pairs · ` +
        `(one install alone is ${perInstall.toFixed(3)} us; the machine's seven read 0.345 each)`,
    );

    // STRUCTURAL: both arms must have walked all seven pairs every round. The sum of the name lengths
    // is fixed, so it is the same number on both sides or one of them is not doing the work.
    const expected =
      ROUNDS *
      pairs.reduce(
        (total, [event, key]) => total + event.length + key.length,
        0,
      );
    expect(sink).toBe(expected * 3 * SAMPLES);
  });
});

report();
