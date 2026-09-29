// The seven microseconds, taken apart.
//
// why: §18s put 7.0 of a tagged node's 8.0 us inside ONE function — the `text-input` behavior's own
// `attach` — which is ~52% of the whole create phase, from a function we own. The engine's half of
// attaching is 0.31. Nothing else measured in this investigation is within an order of magnitude, so
// this is the last thing left to split and the first one worth splitting.
//
// WHAT `attach` DOES (`core/components/src/behaviors/text-input.ts:342`): a `WeakMap` set plus two
// objects, one `setProp`, four `setBehaviorListener` calls, and `attachPressMachine`

// So a `<TextInput>` installs FOUR listeners of its own and answers the press machine's seven
// through one shared `IEventDispatch`. None of the four is in `GATED_EVENT_PROPS`, so none fires
// the extra `setProp` that would otherwise multiply the cost

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
  hasListenerFor,
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
/** The names the press machine answers, `DISPATCH_KEYS` in `behaviors/pressable.ts`. */
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

/** What one `setBehaviorListener` costs alone, set by the closure case and read by the last one. */
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
  // Each rung adds exactly one thing the real `attach` does, so the subtractions attribute all of
  // it, and the last rung landing on the real behavior's reading is what says the imitation is
  // faithful
  it('installs four listeners, and that is where the time goes', () => {
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
    const b4 = arm('bench-b4');
    const real = arm('text-input', 'RCTSinglelineTextInputView');

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

    // THE STRUCTURAL GATES, which no machine load can overturn: each rung must hold exactly the
    // listeners it names, so an arm whose tag failed to register lands here and not in a print
    expect(built.get('bench-b0')?.listeners?.size ?? 0).toBe(0);
    expect(built.get('bench-b3')?.listeners?.size ?? 0).toBe(
      INPUT_EVENTS.length,
    );
    // The press machine adds no `listeners` entry any more, so the seam is what proves it armed
    const armed = built.get('bench-b4');
    expect(armed?.listeners?.size ?? 0).toBe(INPUT_EVENTS.length);
    expect(armed !== undefined && hasListenerFor(armed, 'press')).toBe(true);
  });

  // What a listener install is MADE of: the closure half against the `Map`-write half. The answer
  // is why the press machine stopped installing one per name and points at one `IEventDispatch`

  // BOTH ARMS IN ONE CASE, install for install, so the only difference is where the function came
  // from: a comparison across cases inside a 117-process suite compares two machine loads (§11)
  it('pays more for a fresh closure per listener than for a shared one', () => {
    const nodes: ISymbioteNode[] = [];
    for (let at = 0; at < NODES; at += 1) nodes.push(createElement('RCTView'));
    const names = [...INPUT_EVENTS, 'press', 'pressIn', 'pressOut'];
    const shared = (): undefined => undefined;

    // THE FRESH ARM CAPTURES, т.к. `() => undefined` closes over nothing and the optimizer may hand
    // back ONE function object for the whole loop, which understates it and sends the verdict the
    // wrong way. An arm has to be the shape production has (§18l)
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

    // DISCARDED: the first arm pays `node.listeners ??= new Map()` on every one of the ten thousand
    // nodes, once per node for the whole case
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

    // STRUCTURAL, not comparative: every name must be standing on every node, so an arm whose loop
    // was hoisted or whose `setBehaviorListener` went no-op lands here (§11, §18h)
    expect(nodes[0]?.listeners?.size ?? 0).toBe(names.length);
    perInstall = each(freshWall);
    expect(nodes[NODES - 1]?.listeners?.size ?? 0).toBe(names.length);
  });

  // A `Map` iterator yields a fresh two-element ARRAY per step and the destructuring reads it back,
  // so a fixed table walked per node allocates once per pair for nothing

  // Kept as a priced negative after the press machine stopped walking its table per attach: the
  // same trap is one `for (const [a, b] of someMap)` away in any behavior. Both arms in one case
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

    // THE THIRD SHAPE: an array of TUPLES keeps the pairing two parallel arrays give up, and the
    // tuples already exist, so destructuring them allocates nothing per step
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

    // STRUCTURAL: every arm must have walked all seven pairs each round, and the name lengths sum
    // to a fixed number, so it matches on every side or one of them is not doing the work
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
