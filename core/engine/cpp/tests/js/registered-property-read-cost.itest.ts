// What a registered `@property` adds to the commit of nodes that read `var()`
// Arms run interleaved on fresh trees and the minimum of the rounds is the reading
// Run on `bench:itest` with `SYMBIOTE_ITEST_BYTECODE=1`; the printed numbers carry no gate

import {
  appendChild,
  clearGlobalStyles,
  clearRegisteredProperties,
  committedPayloadOf,
  createElement,
  createSurface,
  registerProperty,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const NODES = 2_000;
const ROUNDS = 7;
const WIDTH = 40;
const HEIGHT = 20;
const MICROS_PER_MS = 1_000;

const DECLARATIONS = { '--w': `${WIDTH}px`, '--h': `${HEIGHT}px` };
const LITERAL_STYLE = {
  width: WIDTH,
  height: HEIGHT,
  paddingTop: WIDTH,
  paddingLeft: HEIGHT,
};
const VAR_STYLE = {
  width: 'var(--w)',
  height: 'var(--h)',
  paddingTop: 'var(--w)',
  paddingLeft: 'var(--h)',
};

type IArm = {
  label: string;
  style: Record<string, unknown>;
  register: () => void;
};

function lengths(...names: string[]): void {
  for (const name of names) {
    registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
  }
}

const ARMS: readonly IArm[] = [
  { label: 'literal', style: LITERAL_STYLE, register: (): void => {} },
  { label: 'var, none', style: VAR_STYLE, register: (): void => {} },
  { label: 'var, other', style: VAR_STYLE, register: (): void => lengths('--other') },
  { label: 'var, typed', style: VAR_STYLE, register: (): void => lengths('--w', '--h') },
];

type ISample = { wall: number; again: number; probe: ISymbioteNode };

// A fresh tree per sample, so the first commit is cold; only `commit()` is on the clock
// The second commit follows an unrelated prop write on every node, which a cache would serve
function sampleOf(arm: IArm): ISample {
  clearGlobalStyles();
  clearRegisteredProperties();
  arm.register();
  const surface = createSurface(ROOT_TAG);
  const container = createElement('RCTView');
  routeProp(container, 'style', DECLARATIONS);
  surface.appendChild(container);
  const nodes: ISymbioteNode[] = [];
  for (let at = 0; at < NODES; at += 1) {
    const node = createElement('RCTView');
    routeProp(node, 'style', arm.style);
    appendChild(container, node);
    nodes.push(node);
  }
  const startedAt = performance.now();
  surface.commit();
  const wall = performance.now() - startedAt;
  mounted();
  for (const node of nodes) setProp(node, 'opacity', 0.5);
  const againAt = performance.now();
  surface.commit();
  const again = performance.now() - againAt;
  mounted();
  return { wall, again, probe: nodes[0] ?? container };
}

describe('the commit cost of a var() read next to a registered property', () => {
  it('commits the same payload in every arm, and prices each', () => {
    const best = new Map<string, number>();
    for (let round = 0; round <= ROUNDS; round += 1) {
      for (const arm of ARMS) {
        const { wall, again, probe } = sampleOf(arm);
        expect(committedPayloadOf(probe)?.width).toBe(WIDTH);
        const isWarmUp = round === 0;
        if (isWarmUp) continue;
        best.set(arm.label, Math.min(best.get(arm.label) ?? Infinity, wall));
        const key = `${arm.label}|again`;
        best.set(key, Math.min(best.get(key) ?? Infinity, again));
      }
    }
    clearGlobalStyles();
    clearRegisteredProperties();

    for (const suffix of ['', '|again']) {
      const floor = best.get(`literal${suffix}`) ?? 0;
      for (const arm of ARMS) {
        const wall = best.get(`${arm.label}${suffix}`) ?? 0;
        print(
          `DEBUG PROPREAD${suffix} ${arm.label.padEnd(11)} ${wall.toFixed(2)} ms · ` +
            `${((wall * MICROS_PER_MS) / NODES).toFixed(3)} us/node · ` +
            `+${(((wall - floor) * MICROS_PER_MS) / NODES).toFixed(3)} over literal`,
        );
      }
    }
    expect(best.get('literal') ?? 0).toBeGreaterThan(0);
  });
});

report();
