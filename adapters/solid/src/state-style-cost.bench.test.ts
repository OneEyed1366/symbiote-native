// Does removing the BUILD-TIME state-style split cost anything at run time?
//
// The transform specialises `style={({pressed}) => …}` into `style={resting}` + `activeStyle={pressed}`
// at compile time. Since the engine learned to resolve a callback in `routeProp`, that split is an
// OPTIMISATION rather than the mechanism — so the question is what it is worth. This file is the A/B,
// kept rather than deleted so the answer can be re-run instead of quoted.
//
// It asserts only IDENTITY (same committed payload, same Fabric counters) and prints the timings.
// A timing assertion here would be flaky and would say nothing a reader could act on.
//
// HEADLESS, which is a screen and not a verdict: this repo has recorded five times that a headless
// number mis-sizes an allocation-shaped cost, in both directions. What does transfer is the
// structural half — the split emits TWO `setProp` calls per node where the callback emits one, and
// that write count is the same on a device.
//
// The `split-hoisted` arm is the optimistic BOUND for the split, not a prediction: it shares both
// objects so the arm allocates nothing. Measured 2026-09-01, babel-preset-solid does NOT hoist —
// `<symbiote-pressable style={{opacity:1}} activeStyle={{opacity:0.6}} />` compiles to two inline
// object literals inside the element factory — so the realistic arm is `split`, and `hoisted` only
// says what a future hoisting optimisation could buy.
import { describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

const fabric = installFabric();
const N = 10_000;
const REPS = 7;

const RESTING = { opacity: 1 };
const ACTIVE = { opacity: 0.6 };
const CALLBACK = (state: { pressed: boolean }): Record<string, unknown> => ({
  opacity: state.pressed ? 0.6 : 1,
});

function build(arm: 'split' | 'split-hoisted' | 'callback', tag: number): void {
  const surface = createSurface(tag);
  for (let i = 0; i < N; i += 1) {
    const node: ISymbioteNode = createElement(
      'RCTView',
      false,
      'symbiote-pressable',
    );
    routeProp(node, 'testID', 'row');
    if (arm === 'split') {
      routeProp(node, 'style', { ...RESTING });
      routeProp(node, 'activeStyle', { ...ACTIVE });
    } else if (arm === 'split-hoisted') {
      // The optimistic bound for the split: both objects shared, so the arm pays no allocation at
      // all. A real emission only reaches this if the compiler hoists the two literals out of the
      // render — asserted nowhere, so this is a BOUND rather than a prediction.
      routeProp(node, 'style', RESTING);
      routeProp(node, 'activeStyle', ACTIVE);
    } else {
      routeProp(node, 'style', CALLBACK);
    }
    surface.appendChild(node);
  }
  surface.commit();
}

function timeArm(
  arm: 'split' | 'split-hoisted' | 'callback',
  base: number,
): number[] {
  const samples: number[] = [];
  for (let r = 0; r < REPS; r += 1) {
    fabric.reset();
    const t0 = performance.now();
    build(arm, base + r);
    samples.push(performance.now() - t0);
  }
  return samples.sort((a, b) => a - b);
}

function counters(): string {
  return `createNode=${fabric.counts.createNode} appendChild=${fabric.counts.appendChild} completeRoot=${fabric.counts.completeRoot}`;
}

describe('state-style: build-time split vs runtime callback', () => {
  it('reports', () => {
    // Warm both paths so neither arm pays first-call JIT.
    build('split', 100);
    build('callback', 101);

    const split = timeArm('split', 1000);
    fabric.reset();
    build('split', 900);
    const splitCounters = counters();

    const hoisted = timeArm('split-hoisted', 3000);
    const callback = timeArm('callback', 2000);
    fabric.reset();
    build('callback', 901);
    const callbackCounters = counters();

    // The identity check the timing is worthless without: same payload, same key set, and the
    // pressed variant reachable on both arms.
    fabric.reset();
    const sA = createSurface(7001);
    const a = createElement('RCTView', false, 'symbiote-pressable');
    routeProp(a, 'testID', 'row');
    routeProp(a, 'style', { ...RESTING });
    routeProp(a, 'activeStyle', { ...ACTIVE });
    sA.appendChild(a);
    sA.commit();
    const payloadA = { ...fabric.appRoot().children[0].props };

    fabric.reset();
    const sB = createSurface(7002);
    const b = createElement('RCTView', false, 'symbiote-pressable');
    routeProp(b, 'testID', 'row');
    routeProp(b, 'style', CALLBACK);
    sB.appendChild(b);
    sB.commit();
    const payloadB = { ...fabric.appRoot().children[0].props };

    console.log('PAYLOAD split   :', JSON.stringify(payloadA));

    console.log('PAYLOAD callback:', JSON.stringify(payloadB));
    expect(Object.keys(payloadB).sort()).toEqual(Object.keys(payloadA).sort());
    expect(payloadB).toEqual(payloadA);

    const med = (xs: number[]): number => xs[Math.floor(xs.length / 2)];

    console.log(
      `\nN=${N} nodes x ${REPS} reps` +
        `\n  split    min=${split[0].toFixed(1)} med=${med(split).toFixed(1)} max=${split[split.length - 1].toFixed(1)}  ${splitCounters}` +
        `\n  hoisted  min=${hoisted[0].toFixed(1)} med=${med(hoisted).toFixed(1)} max=${hoisted[hoisted.length - 1].toFixed(1)}` +
        `\n  callback min=${callback[0].toFixed(1)} med=${med(callback).toFixed(1)} max=${callback[callback.length - 1].toFixed(1)}  ${callbackCounters}` +
        `\n  delta med = ${(((med(callback) - med(split)) / med(split)) * 100).toFixed(1)}%\n`,
    );
    expect(splitCounters).toBe(callbackCounters);
  });
});
