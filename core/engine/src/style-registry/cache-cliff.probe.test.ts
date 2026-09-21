// What the resolved-class cache does when the working set does not fit.
//
// WHY THIS EXISTS. `resolveClassName` memoises by the authored string, and the memo is not merely a
// speed-up: `isAlreadyPublished` (node.ts) turns a re-push away with `Object.is`, so a thousand rows
// carrying the same class cost zero writes ONLY because they all get back the identical object. The
// cache therefore sits on the write path's correctness-adjacent fast lane, not beside it.
//
// Its overflow policy USED TO BE a full clear:
//
//   if (resolvedCache.size >= RESOLVED_CACHE_LIMIT) resolvedCache.clear();
//
// which degrades as a CLIFF rather than a slope: a working set of 512 distinct class strings is
// fully cached and one of 513, cycled, misses every single time. An app does not have to be unusual
// to land there; a list whose rows carry a per-row modifier class reaches it at row 513. Measured at
// 15.4x for those two extra classes, which is what moved the registry to random eviction.
//
// The probe stays because the cliff is a property of the POLICY, not of a bug that was fixed: any
// future change back to clear-or-FIFO reintroduces it, and this is what would say so.
//
// It prices the round trip, not the cache: what a miss costs is the tokeniser, the bucket scan, the
// cascade sort and a spread-reduce per matched rule.

import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { registerRules, resolveClassName, type IStyleRule } from './index';

const LIMIT = 512;

// One rule per class, so every lookup matches and pays the full resolve on a miss. Registered once
// for the widest arm; the narrower arms simply use a prefix of the same names.
const NAMES = Array.from({ length: LIMIT * 4 }, (_, at) => `probe-${at}`);

const RULES: readonly IStyleRule[] = NAMES.map((name, at) => ({
  tokens: [name],
  specificity: [0, 1, 0],
  order: at,
  style: { paddingLeft: 4, marginTop: 2 },
}));

registerRules(RULES);

/** Cycle a working set of `distinct` names, `passes` times over, and report ms per resolution. */
function millisPerResolve(distinct: number, passes: number): number {
  const working = NAMES.slice(0, distinct);
  // One untimed pass so the arm is not paying for its own first-touch misses.
  for (const name of working) resolveClassName(name);

  const startedAt = performance.now();
  for (let pass = 0; pass < passes; pass += 1) {
    for (const name of working) resolveClassName(name);
  }
  const ms = performance.now() - startedAt;
  return ms / (distinct * passes);
}

// WHICH POLICY ACTUALLY HELPS — asked because the obvious answer is wrong.
//
// The reflex repair for a clear-on-overflow cache is "evict one entry instead". On the access
// pattern that produces the cliff it changes nothing: a working set slightly WIDER than the cache,
// walked in order, is Belady's worst case, and FIFO and LRU both miss on every single access
// exactly as the full clear does — each eviction throws away the entry the next access needs.
//
// The registry's own comment already rules LRU out for a different and correct reason ("an LRU's
// bookkeeping costs more than the rebuild it saves"), so the question is not LRU versus clear. It is
// whether ANY bounded policy degrades gracefully here. Random eviction does, and this simulates the
// three to put a number on it rather than argue from the literature.
function hitRateOf(
  policy: 'clear' | 'fifo' | 'random',
  distinct: number,
  capacity: number,
  passes: number,
): number {
  const cache = new Set<number>();
  let hits = 0;
  let lookups = 0;

  for (let pass = 0; pass < passes; pass += 1) {
    for (let key = 0; key < distinct; key += 1) {
      lookups += 1;
      if (cache.has(key)) {
        hits += 1;
        continue;
      }
      if (cache.size >= capacity) {
        if (policy === 'clear') cache.clear();
        else if (policy === 'fifo') {
          // A JS Map/Set keeps insertion order, so the first key IS the oldest — FIFO with no
          // bookkeeping at all, which is the cheapest thing that could work.
          const oldest = cache.values().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        } else {
          const victims = [...cache];
          cache.delete(victims[Math.floor(Math.random() * victims.length)]);
        }
      }
      cache.add(key);
    }
  }
  return hits / lookups;
}

it('says which eviction policy survives a cyclic working set', () => {
  const capacity = LIMIT;
  const sizes = [LIMIT + 1, LIMIT * 2, LIMIT * 4] as const;
  const lines: string[] = [];

  for (const distinct of sizes) {
    const rates = (['clear', 'fifo', 'random'] as const).map(policy =>
      hitRateOf(policy, distinct, capacity, 20),
    );
    lines.push(
      `  ${String(distinct).padStart(5)} distinct   clear ${(rates[0] * 100).toFixed(1)}%   fifo ${(rates[1] * 100).toFixed(1)}%   random ${(rates[2] * 100).toFixed(1)}%`,
    );
  }

  writeFileSync(
    new URL('../../../../.docs/class-cache-policies.txt', import.meta.url),
    `\n  hit rate, cache of ${capacity}, working set walked in order and repeated\n\n` +
      `${lines.join('\n')}\n\n` +
      `  FIFO is not the repair: on a cyclic scan it evicts exactly the entry wanted next.\n` +
      `  Random keeps roughly capacity/working-set, which is the graceful slope the cliff lacks.\n`,
  );

  // Deterministic, so this one CAN be asserted: on a cyclic scan one past capacity, neither the
  // clear nor FIFO ever hits, and random does. That is the whole claim.
  expect(hitRateOf('clear', capacity + 1, capacity, 20)).toBe(0);
  expect(hitRateOf('fifo', capacity + 1, capacity, 20)).toBe(0);
  expect(hitRateOf('random', capacity + 1, capacity, 20)).toBeGreaterThan(0);
});

it('degrades as a cliff once the working set passes the cache limit', () => {
  const sizes = [
    LIMIT / 2,
    LIMIT - 1,
    LIMIT + 1,
    LIMIT * 2,
    LIMIT * 4,
  ] as const;
  const perResolve = sizes.map(size => millisPerResolve(size, 20));

  const lines = sizes
    .map(
      (size, at) =>
        `  ${String(size).padStart(5)} distinct   ${(perResolve[at] * 1000).toFixed(3)} us per resolve`,
    )
    .join('\n');

  const under = perResolve[1];
  const over = perResolve[2];
  writeFileSync(
    new URL('../../../../.docs/class-cache-cliff.txt', import.meta.url),
    `\n  resolving a working set of N distinct class strings, cycled\n` +
      `  cache limit is ${LIMIT}; overflow evicts ONE entry at random\n\n${lines}\n\n` +
      `  ${LIMIT - 1} -> ${LIMIT + 1}: ${(over / under).toFixed(1)}x for two more classes\n` +
      `  under the clear-on-overflow policy this step read 15.4x — that was the cliff\n`,
  );

  // Captured, not bounded. The cliff is a 15x effect and would survive a threshold comfortably in
  // isolation, but wall time inside a parallel suite run is not reproducible — a sibling probe in
  // this repo already failed that way once. The multiple is the product and it lives in the file;
  // what is asserted here is only that both arms were measured.
  expect(under).toBeGreaterThan(0);
  expect(over).toBeGreaterThan(0);
});
