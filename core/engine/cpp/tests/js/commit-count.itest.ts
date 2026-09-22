// `commitNumber()` counts COMMITS, and the suite's `commits=1` on every step is only worth
// something if this file can make it read anything else.
//
// why it exists at all: the device's overhead is +115 ms for us against +30 for stock, and the
// mutation oracle says both arms hand Fabric a byte-identical list on all eight steps. So the
// difference is not WHAT the platform is told but how many times it is told — each commit signals
// the mounting thread, and on a device that is `RCTMountingManager` on the main thread. A commit
// count is the only part of that question a headless host can answer.
//
// The first instrument tried here counted mounting TRANSACTIONS and read 1 everywhere for a reason
// that had nothing to do with the renderers: `MountingCoordinator::pullTransaction` diffs the base
// revision against the latest, so intermediate commits collapse and a `while (pullTransaction())`
// loop counts the caller's own drains. A counter that can only return 1 is indistinguishable from a
// true answer of 1, which is exactly what this file exists to tell apart.

import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { commitNumber, describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const surface = createSurface(ROOT_TAG);

describe('the commit counter', () => {
  // why: THE BREAK TEST for every `commits=` the bench suite prints. Three commits that each
  // actually change something must advance the number by three; a counter wired to a transaction
  // pull, or to a constant, reads 1 here and the suite's verdict evaporates with it.
  it('advances once per commit that changed something', () => {
    const before = commitNumber();
    const node = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    routeProp(node, 'nativeID', 'first');
    surface.commit();
    routeProp(node, 'nativeID', 'second');
    surface.commit();
    mounted();

    expect(commitNumber() - before).toBe(3);
  });

  // why: THE OTHER HALF, and it is what makes the count mean "work the platform was given" rather
  // than "times JS asked". A commit whose tree is unchanged never reaches the shadow tree at all —
  // `hasChangedSinceCommit()` stays false — so it must not advance the number. Without this, an arm
  // that commits idly would read as doing more platform work than one that does not.
  it('does not advance when the commit changed nothing', () => {
    const node = createElement('RCTView');
    appendChild(node, createElement('RCTView'));
    surface.appendChild(node);
    surface.commit();
    mounted();

    const settled = commitNumber();
    surface.commit();
    surface.commit();
    mounted();

    expect(commitNumber()).toBe(settled);
  });
});

report();
