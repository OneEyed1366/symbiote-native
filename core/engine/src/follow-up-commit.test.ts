// A host that answers `true` to a commit has views left for the next one, so the engine commits
// again once two frames have passed (Android styles a view only in a commit after it is inserted)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface } from './index';
import { OP_COMMIT, OP_STRIDE, type IMutationBatch } from './mutation-buffer';
import { setTreeHost, treeHost } from './tree-host';

installRecordingFabric();
let nextRootTag = 9_500;

// Frame callbacks wait here until a test steps them
const pendingFrames: (() => void)[] = [];

function stepFrame(): void {
  pendingFrames.shift()?.();
}

function holdsCommit(batch: IMutationBatch): boolean {
  for (let at = 0; at < batch.ops.length; at += OP_STRIDE) {
    if (batch.ops[at] === OP_COMMIT) return true;
  }
  return false;
}

// Mounts one view and counts the commits the host sees, the first `asking` of them answering `true`
function mountAskingFollowUps(asking: number): { commitCount: () => number } {
  const base = treeHost();
  if (base === undefined)
    throw new Error('the recording host is not installed');
  let commits = 0;
  setTreeHost({
    ...base,
    applyOps: batch => {
      base.applyOps(batch);
      if (!holdsCommit(batch)) return undefined;
      commits += 1;
      return commits <= asking ? true : undefined;
    },
  });
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(createElement('RCTView'));
  surface.commit();
  return { commitCount: () => commits };
}

afterEach(() => {
  pendingFrames.length = 0;
  vi.unstubAllGlobals();
});

describe('commit after mount', () => {
  it('commits again only after two frames, once the host asks for it', () => {
    vi.stubGlobal('requestAnimationFrame', (run: () => void) =>
      pendingFrames.push(run),
    );
    const { commitCount } = mountAskingFollowUps(1);

    expect(commitCount()).toBe(1);
    stepFrame();
    expect(commitCount()).toBe(1);
    stepFrame();
    expect(commitCount()).toBe(2);
  });

  it('does not commit again when the host does not ask', () => {
    vi.stubGlobal('requestAnimationFrame', (run: () => void) =>
      pendingFrames.push(run),
    );
    const { commitCount } = mountAskingFollowUps(0);

    expect(pendingFrames).toHaveLength(0);
    expect(commitCount()).toBe(1);
  });

  it('stops after three follow-ups, since a host that never settles must not spin', () => {
    vi.stubGlobal('requestAnimationFrame', (run: () => void) =>
      pendingFrames.push(run),
    );
    const { commitCount } = mountAskingFollowUps(Infinity);

    for (let frame = 0; frame < 20; frame += 1) stepFrame();

    expect(commitCount()).toBe(4);
  });
});
