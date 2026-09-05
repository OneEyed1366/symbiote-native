// Co-located unit test for the anchor-flattening instruments added beside the dirty-marking ones:
// `childScans` / `childFlattens` / `childFlattenWidest` in readCommitProfile() (../commit.ts) and
// censusRetainedTree (../node.ts).
//
// Both exist to answer one question with a number instead of a grep — how much an adapter's anchors
// cost the commit walk — and both are invisible in the committed output: a tree with anchors and a
// tree without commit byte-identical Fabric calls. So nothing else in the suite can go red if these
// stop counting, which is exactly why they are pinned here.
//
// The counters are read-and-zeroed, so every case below takes a fresh reading first. A shared
// accumulator that an earlier case already filled is the standard way a counter assertion passes
// vacuously (.claude/rules/test-harness-false-greens.md).

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  censusRetainedTree,
  createAnchor,
  createElement,
  createRawText,
  createSurface,
  readCommitProfile,
  setProp,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
const ROOT_TAG = 4242;
const surface = createSurface(ROOT_TAG);

const WIDE_CHILDREN = 40;

function view(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  setProp(node, 'testID', testID);
  return node;
}

beforeEach(() => {
  fabric.reset();
  readCommitProfile();
});

describe('renderableChildren scan counters', () => {
  describe('Positive', () => {
    // why: the no-anchor case is the one that must stay free, and as of 2026-09-05 it is free in a
    // stronger sense than this case used to assert. It read "every reconciled node scans its
    // children exactly once" and required `childScans >= 3`, which was a true description of the
    // walk and is now a description of the thing the edit buffer's op log removed: a node with no
    // skipped children REPLAYS its list from the ops the adapter issued and never scans at all.
    //
    // Re-aimed at the property rather than at a new fixed number, because a number here is the same
    // debt payable next time the derivation moves (`.claude/rules/test-harness-false-greens.md`
    // §23b). The ONE surviving scan is the synthetic container: `commitChildren` hands its whole
    // top-level list over at once, which no sequence of child ops describes, so its log is poisoned
    // to `null` and it re-derives. Everything below it replays.
    it('replays a clean parent instead of scanning it', () => {
      const parent = view('clean-parent');
      appendChild(parent, view('clean-a'));
      appendChild(parent, view('clean-b'));
      surface.appendChild(parent);
      surface.commit();

      const profile = readCommitProfile();
      expect(profile.childFlattens, 'no anchor, no flatten').toBe(0);
      expect(
        profile.childScans,
        'only the container, whose whole list arrives at once, re-derives',
      ).toBe(1);
      expect(
        profile.childListsReplayed,
        'the parent and both leaves build their lists from the op log',
      ).toBe(3);
    });

    // why: THE number. One anchor anywhere in a wide child list defeats the probe for the whole
    // list, and `widest` is what separates a defeated scan over three children (noise) from one
    // over a thousand (not noise) — a count alone cannot.
    it('records the width of the widest defeated scan', () => {
      const parent = view('wide-parent');
      for (let index = 0; index < WIDE_CHILDREN; index += 1)
        appendChild(parent, view(`wide-${String(index)}`));
      const anchor = createAnchor();
      appendChild(anchor, view('behind-anchor'));
      appendChild(parent, anchor);
      surface.appendChild(parent);
      surface.commit();

      const profile = readCommitProfile();
      expect(profile.childFlattens, 'the anchor defeats the probe').toBe(1);
      expect(
        profile.childFlattenWidest,
        'the flatten ranges over every child of the parent, not just the anchor',
      ).toBe(WIDE_CHILDREN + 1);
      expect(
        profile.childFlattenProbed,
        'and it re-walks all of them to build the flat list',
      ).toBe(WIDE_CHILDREN + 1);
    });

    // why: an anchor is not the only thing the walk skips. An empty raw text is skipped for a
    // different reason (Fabric aborts on it) and defeats the same probe, so a counter that only
    // knew about anchors would under-report every text-heavy tree.
    it('counts an empty raw text as a defeating child too', () => {
      const parent = createElement('RCTText', true);
      setProp(parent, 'testID', 'text-parent');
      appendChild(parent, createRawText(''));
      appendChild(parent, createRawText('real'));
      surface.appendChild(parent);
      surface.commit();

      expect(
        readCommitProfile().childFlattens,
        'an empty raw text defeats the probe exactly as an anchor does',
      ).toBe(1);
    });
  });

  describe('Negative', () => {
    // why: read-and-zero is the contract a sampler depends on — two reads of one commit must not
    // double-count it, or a device window reports work that never happened.
    it('zeroes the counters on read', () => {
      const parent = view('zeroed-parent');
      appendChild(parent, createAnchor());
      surface.appendChild(parent);
      surface.commit();
      readCommitProfile();

      const second = readCommitProfile();
      expect(second.childScans, 'a second read sees an empty window').toBe(0);
      expect(second.childFlattens).toBe(0);
      expect(second.childFlattenWidest).toBe(0);
    });
  });
});

describe('censusRetainedTree', () => {
  describe('Positive', () => {
    // why: the whole per-adapter comparison rests on this split. An anchor is a retained node the
    // walk never reconciles; counting it as renderable would make every adapter look identical,
    // which is the opposite of what the census is for.
    it('separates anchors from the nodes that actually paint', () => {
      const root = view('census-root');
      const anchor = createAnchor();
      appendChild(anchor, view('census-child'));
      appendChild(root, anchor);
      appendChild(root, createRawText(''));

      const census = censusRetainedTree([root]);
      expect(census.nodes, 'root + anchor + child + empty raw text').toBe(4);
      expect(census.anchors).toBe(1);
      expect(census.emptyRawTexts).toBe(1);
      expect(
        census.renderable,
        'only the root and the anchor-hosted child ever reach Fabric',
      ).toBe(2);
    });

    // why: the widths are the point, not the count — reported widest-first so a report can quote
    // the head of the list rather than sort it again.
    it('reports the width of each parent holding a skipped child, widest first', () => {
      const root = view('widths-root');
      const wide = view('widths-wide');
      for (let index = 0; index < WIDE_CHILDREN; index += 1)
        appendChild(wide, view(`widths-${String(index)}`));
      appendChild(wide, createAnchor());
      appendChild(root, wide);
      const narrow = view('widths-narrow');
      appendChild(narrow, createAnchor());
      appendChild(root, narrow);

      expect(censusRetainedTree([root]).flattenWidths).toEqual([
        WIDE_CHILDREN + 1,
        1,
      ]);
    });
  });
});
