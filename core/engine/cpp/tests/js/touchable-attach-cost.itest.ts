// `touchable-opacity` and `pressable` run the SAME press machine, so what separates their mount
// cost is the animated opacity layer `attach` binds through `setAnimatedBehaviorStyle`

import { createElement } from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
import {
  registerPressableBehavior,
  registerTouchableOpacityBehavior,
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

// What the layer may cost, as a multiple of the press machine beside it. Measured separation
// before the fix is 7.5x, so 2x still fails a rebuilt `AnimatedProps` leaf per node
const LAYER_BUDGET = 2;

// What `attach` may allocate per pressable, as a multiple of the whole node beside it: the seven
// dispatcher closures and the `Map` holding them. Building the gesture runtime there too read
// 4.6x, installing the dispatchers alone reads 2.6x, so the bound sits between the two
const MACHINE_BUDGET = 3;

type IReading = { readonly bytes: number; readonly wall: number };

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
  it('costs its press machine plus a layer, not a multiple of it', () => {
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
        `${(layer / Math.max(1, machine)).toFixed(1)}x the machine`,
    );

    expect(layer).toBeLessThan(machine * LAYER_BUDGET);
    // Read by the case below, which needs arms measured on the same machine (§11)
    machineBytes = machine;
    plainBytes = plain.bytes;
  });

  // The gesture runtime is only ever read from a dispatcher, so a pressable nobody touches has no
  // use for it. What `attach` still owes is the dispatchers themselves
  it('installs its dispatchers without building the gesture runtime', () => {
    print(
      `DEBUG TOUCHABLE machine ${machineBytes.toFixed(0)}B = ` +
        `${(machineBytes / Math.max(1, plainBytes)).toFixed(1)}x the node`,
    );
    expect(machineBytes).toBeLessThan(plainBytes * MACHINE_BUDGET);
  });
});

report();
