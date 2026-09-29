// `touchable-opacity` and `pressable` run the SAME press machine, so what separates their mount
// cost is the animated opacity layer `attach` binds through `setAnimatedBehaviorStyle`

import {
  ANCHOR_COMPONENT,
  appendChild,
  createElement,
  setBehaviorListener,
} from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
import {
  registerPressableBehavior,
  registerTouchableNativeFeedbackBehavior,
  registerTouchableOpacityBehavior,
  registerTouchableWithoutFeedbackBehavior,
} from '@symbiote-native/components';

import {
  collectGarbage,
  describe,
  expect,
  heapInfo,
  it,
  print,
  report,
} from './harness';

const NODES = 2_000;
const SAMPLES = 5;

// `false` on `build-release` (`scripts/run-itests.mjs`), `true` on the assert build CI runs
declare const __DEV__: boolean;
const isBenchBuild = __DEV__ === false;

// Both budgets below are a fraction of the whole plain node, never of each other: the machine
// allocates NOTHING now, and a ratio against zero carries no verdict

// What `touchable-opacity`'s attach may cost over `pressable`'s. Building the `AnimatedValue`, the
// feedback runtime and the timer set there read 2.6x the node, a flatten guard alone reads 0.12x
const LAYER_BUDGET = 0.5;

// What `attach` may allocate per pressable. Building the gesture runtime there read 4.6x the node
// and installing seven dispatchers 2.6x; one shared `IEventDispatch` installs neither
const MACHINE_BUDGET = 0.25;

// How much dearer `touchable-without-feedback`'s arm may be than `touchable-native-feedback`'s for
// the same shape. Building the timing state at arm read 8.9x and deferring it reads 2.8x, so the
// bound sits between; what is left is twf's per-item refinement closure against tnf's module one
const TWF_OVER_TNF_BUDGET = 4;

// What a `<text-input>` installs: the press machine's seven plus its own four
const ELEVEN_NAMES: readonly string[] = [
  'press',
  'pressIn',
  'pressOut',
  'startShouldSetResponder',
  'responderMove',
  'responderTerminationRequest',
  'responderGrant',
  'change',
  'focus',
  'blur',
  'selectionChange',
];

// Hoisted, so the shared-dispatcher arm installs ONE function under eleven names
function sharedDispatcher(): undefined {
  return undefined;
}

type IReading = { readonly bytes: number; readonly wall: number };

// An anchor-backed touchable with the app child it adopts, which is what arms its press machine
function armed(tag: string): unknown {
  const owner = createElement(ANCHOR_COMPONENT, false, tag);
  const child = createElement('RCTView');
  appendChild(owner, child);
  return child;
}

/** Set by the first case, read by the second: both arms have to see the same machine. */
let machineBytes = 0;
let plainBytes = 0;

// Best of `SAMPLES` on the clock, the allocation of one clean run on the bytes. Bytes carry the
// gate, т.к. an allocation counter is deterministic and a wall clock in a 117-process suite is not
function measure(run: () => void): IReading {
  let wall = Infinity;
  const sink: unknown[] = [];
  for (let at = 0; at < SAMPLES; at += 1) {
    takeBatch();
    sink.length = 0;
    const startedAt = performance.now();
    for (let node = 0; node < NODES; node += 1) sink.push(run());
    const took = performance.now() - startedAt;
    if (took < wall) wall = took;
  }
  takeBatch();
  sink.length = 0;
  collectGarbage();
  const before = heapInfo().hermes_totalAllocatedBytes ?? 0;
  for (let node = 0; node < NODES; node += 1) sink.push(run());
  const bytes = (heapInfo().hermes_totalAllocatedBytes ?? 0) - before;
  takeBatch();
  sink.length = 0;
  return { bytes: bytes / NODES, wall: (wall * 1_000) / NODES };
}

describe('mounting a touchable-opacity', () => {
  // Three arms in one case so they see the same machine, each a strict superset of the one above
  it('costs a flatten guard over a plain pressable, not a fade runtime', () => {
    registerPressableBehavior();
    registerTouchableOpacityBehavior();

    // Discarded: the first arm in a process pays a cold allocator and every lazy module binding
    measure(() => createElement('RCTView'));

    const plain = measure(() => createElement('RCTView'));
    const press = measure(() => createElement('RCTView', false, 'pressable'));
    const opacity = measure(() =>
      createElement('RCTView', false, 'touchable-opacity'),
    );

    const layer = opacity.bytes - press.bytes;
    const machine = press.bytes - plain.bytes;
    print(
      `DEBUG TOUCHABLE plain ${plain.bytes.toFixed(0)}B/${plain.wall.toFixed(2)}us ` +
        `press ${press.bytes.toFixed(0)}B/${press.wall.toFixed(2)}us ` +
        `opacity ${opacity.bytes.toFixed(0)}B/${opacity.wall.toFixed(2)}us :: ` +
        `machine ${machine.toFixed(0)}B layer ${layer.toFixed(0)}B = ` +
        `${(layer / plain.bytes).toFixed(2)}x the node`,
    );

    // Handed over BEFORE the assertion, so a red here leaves the case below measuring rather than
    // dividing by a zero it reads as a second failure
    machineBytes = machine;
    plainBytes = plain.bytes;
    // Release only: the assert build charges its own per-attach bookkeeping, 560 B against 63 here,
    // so the budget it was calibrated on reports a regression that does not ship
    if (isBenchBuild) expect(layer).toBeLessThan(plain.bytes * LAYER_BUDGET);
    else print('DEBUG TOUCHABLE assert build: the budget is release-only');
  });

  // Nothing under a dispatcher is read until a finger lands, and the dispatchers are one
  // module-level `IEventDispatch` the node points at, so arming a machine allocates nothing
  it('arms its press machine without allocating anything per node', () => {
    print(
      `DEBUG TOUCHABLE machine ${machineBytes.toFixed(0)}B = ` +
        `${(machineBytes / plainBytes).toFixed(2)}x the node`,
    );
    // Release only, same reason as the case above
    if (isBenchBuild)
      expect(machineBytes).toBeLessThan(plainBytes * MACHINE_BUDGET);
    else print('DEBUG TOUCHABLE assert build: the budget is release-only');
  });

  // Both anchor-backed touchables commit ONE node, adopt the app's child as the responder and run
  // the same press machine on it, so their cost over `pressable` + that child is the tag's own
  it('costs no more for an adopted child than the machine it arms on it', () => {
    registerTouchableWithoutFeedbackBehavior();
    registerTouchableNativeFeedbackBehavior();

    // The floor both arms are measured against: the press machine on a node, plus the plain view
    // the touchable adopts
    const floor = measure(() => {
      const child = createElement('RCTView');
      createElement('RCTView', false, 'pressable');
      return child;
    });

    const withoutFeedback = measure(() => armed('touchable-without-feedback'));
    const nativeFeedback = measure(() => armed('touchable-native-feedback'));

    const twfOver = withoutFeedback.bytes - floor.bytes;
    const tnfOver = nativeFeedback.bytes - floor.bytes;
    print(
      `DEBUG TOUCHABLE floor ${floor.bytes.toFixed(0)}B/${floor.wall.toFixed(2)}us ` +
        `twf ${withoutFeedback.bytes.toFixed(0)}B/${withoutFeedback.wall.toFixed(2)}us ` +
        `tnf ${nativeFeedback.bytes.toFixed(0)}B/${nativeFeedback.wall.toFixed(2)}us :: ` +
        `over the floor twf ${twfOver.toFixed(0)}B tnf ${tnfOver.toFixed(0)}B`,
    );

    // `touchable-native-feedback` arms with a module-level refinement where
    // `touchable-without-feedback` builds a per-item one plus its timing state, and that gap is
    // the only thing between two tags with the same shape
    expect(twfOver).toBeLessThan(tnfOver * TWF_OVER_TNF_BUDGET);
  });

  // What one installed dispatcher costs, which is the quantity every remaining behavior cost is
  // made of: a `<text-input>` installs ELEVEN, a pressable seven
  it('charges a flat price per installed listener, whatever the count', () => {
    const bare = measure(() => createElement('RCTView'));
    const one = measure(() => {
      const node = createElement('RCTView');
      setBehaviorListener(node, 'press', () => undefined);
      return node;
    });
    const eleven = measure(() => {
      const node = createElement('RCTView');
      for (const name of ELEVEN_NAMES)
        setBehaviorListener(node, name, () => undefined);
      return node;
    });

    // The same eleven names against ONE function: what a shared dispatcher keyed on `event.type`
    // would install, so the difference names the CLOSURE half of the price and the rest is the Map
    const shared = measure(() => {
      const node = createElement('RCTView');
      for (const name of ELEVEN_NAMES)
        setBehaviorListener(node, name, sharedDispatcher);
      return node;
    });

    const first = one.bytes - bare.bytes;
    const each = (eleven.bytes - one.bytes) / (ELEVEN_NAMES.length - 1);
    const closureHalf = (eleven.bytes - shared.bytes) / ELEVEN_NAMES.length;
    print(
      `DEBUG TOUCHABLE listeners bare ${bare.bytes.toFixed(0)}B ` +
        `one ${one.bytes.toFixed(0)}B eleven ${eleven.bytes.toFixed(0)}B ` +
        `shared ${shared.bytes.toFixed(0)}B :: ` +
        `first ${first.toFixed(0)}B each ${each.toFixed(0)}B ` +
        `eleven of them ${(first + each * 10).toFixed(0)}B :: ` +
        `closure ${closureHalf.toFixed(0)}B slot ${(each - closureHalf).toFixed(0)}B`,
    );

    // The FIRST one pays for the `Map` as well, so it must cost more than the ten after it. A
    // per-listener price that caught up with the first would mean the map is being rebuilt
    expect(first).toBeGreaterThan(each);
  });
});

report();
