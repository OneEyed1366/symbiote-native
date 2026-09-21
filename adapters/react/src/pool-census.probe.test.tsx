// How many of a REAL screen's committed payloads are DISTINCT — the one number that decides whether
// a content-addressed props cache is worth building.
//
// `core/engine/bench/props-construction.cpp` measures the cache's break-even at a 22-27% hit rate:
// below that, keying parsed props on the payload costs more than parsing them. The benchmark row
// hits 70% and is the best case BY CONSTRUCTION — a thousand identical rows. So the open question
// is what a real screen does, and it is a property of the INPUT, not of the cache.
//
// WHICH SCREEN, AND WHY THIS ONE IS THE ADVERSARIAL END. `StyleShowcaseScreen` is a gallery: one of
// each thing, six stylesheets, deliberately built so every tile looks different from its neighbour.
// That is the LEAST repetitive screen in the tree, so its hit rate is a floor and not an average. A
// number above the break-even here is strong evidence; a number below it only says the floor is low.
//
// ── THIS DOES NOT RUN YET, AND THE BLOCKER IS STRUCTURAL ─────────────────────────────────────────
//
// `examples/react` is outside the pnpm workspace (root `CLAUDE.md`, `<examples_vs_dot_examples>`)
// and carries its OWN installed `react` and `@symbiote-native/react`. So the screen's `useState`
// resolves to `examples/react/node_modules/react` while this file's `mount` comes from the
// workspace source, and the two React copies do not share a dispatcher:
//
//   [symbiote] react render (no error boundary):
//     TypeError: Cannot read properties of null (reading 'useState')
//
// The committed tree is then ONE node — the synthetic AppContainer, zero children — and a census
// over it reads `nodes 1 · distinct 1 · hit rate 0%`. A number, from a screen that never rendered.
//
// Making it run needs a `resolve.alias` for `react` and `@symbiote-native/*` on a vitest project
// allowed to reach into `examples/`, which deliberately widens a boundary the config draws on
// purpose. That is a decision about the runner, not something a probe should take on its own.
//
// So the sentinel is the point of the file as it stands: it FAILS and names the blocker, rather
// than reporting a hit rate nobody can use (`.claude/rules/test-harness-false-greens.md` §13 — an
// empty result is a broken instrument, not a finding).

import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  waitUntil,
} from '@symbiote-native/test-utils';
import { registerRules } from '@symbiote-native/engine';
import { compileCssToRules } from '../../../core/css-parser/src/index.ts';

const ROOT_TAG = 94_001;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
afterEach(() => unmount(ROOT_TAG));

// The app's OWN stylesheets, through the real parser. Registering them by hand is the same move
// `core/engine/src/__tests__/real-payload.probe.test.ts` makes and for the same reason: a class that
// resolves to nothing strips the style keys out of every payload, and style is the half of a payload
// that decides the census.
const SHEETS = [
  'StyleShowcase.css',
  'StyleShowcase.limits.css',
  'showcase.scss',
  'showcase.less',
];
for (const sheet of SHEETS) {
  const source = readFileSync(
    new URL(`../../../examples/react/screens/${sheet}`, import.meta.url),
    'utf8',
  );
  const compiled = compileCssToRules(source, { filename: sheet });
  registerRules(Array.isArray(compiled) ? compiled : compiled.rules);
}

// OPT-IN, because it cannot pass until the blocker above is decided and a permanently red case in
// everyone's run trains people to ignore reds. `SYMBIOTE_POOL_CENSUS=1 npx vitest run <this file>`
// reproduces the failure with the blocker named — the same opt-in shape
// `real-payload.probe.test.ts` uses for its write.
it.runIf(process.env.SYMBIOTE_POOL_CENSUS !== undefined)(
  'censuses the distinct committed payloads of a real screen',
  async () => {
    const { StyleShowcaseScreen } =
      await import('../../../examples/react/screens/StyleShowcaseScreen.tsx');
    mount(ROOT_TAG, <StyleShowcaseScreen />);
    // React's commit is batched, so the tree is empty on the turn `mount` returns. A condition, not a
    // tick count — `wait-for.ts` records why.
    await waitUntil(() => fabric.commits > 0);

    const payloads: string[] = [];
    live.walkLive(live.appRoot(), node => {
      // Key-order independent: two payloads with the same pairs in a different order are one cache
      // key, because `folly::dynamic::hash()` hashes a map and not an insertion order.
      payloads.push(
        JSON.stringify(node.payload, Object.keys(node.payload).sort()),
      );
    });

    // THE SENTINEL, asserted BEFORE the census so a dead harness cannot print a hit rate. A screen
    // this size commits hundreds of nodes; one node is the AppContainer alone, which is exactly what
    // a failed render leaves behind.
    expect(
      payloads.length,
      'the screen did not render — see the header: examples/react resolves its own react copy',
    ).toBeGreaterThan(50);

    const distinct = new Set(payloads).size;
    const hitRate = (100 * (payloads.length - distinct)) / payloads.length;

    console.log(
      `nodes ${payloads.length} · distinct ${distinct} · hit rate ${hitRate.toFixed(0)}%` +
        `  (break-even 22-27%)`,
    );
  },
);
