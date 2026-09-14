// `stickyHeaderIndices` on the lowered path — the COMPATIBILITY half of sticky headers, for apps
// written against RN's own API rather than against our `<sticky-header>` tag.
//
// WHAT IS NEW HERE, and it is only the selection: the pin, the debounce, the cross-talk and the
// owner-side props are the child form's and are covered by `sticky.test.ts`. What this file pins is
// the walk that turns an index into a wrapper — the paint-index basis, the two forms coexisting on
// one scroll view, the composition that a written-straight-onto-the-child pin would destroy, and
// the one-commit latency that `afterCommit` cannot avoid.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installFabric,
  type IFakeNode,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createAnchor,
  createElement,
  createSurface,
  removeChild,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerScrollViewBehavior } from './index';
import { SCROLL_VIEW_TAG } from './shared';
import { STICKY_HEADER_TAG } from './sticky';

const fabric = installFabric();
let nextRootTag = 9900;

// iOS's debounce window (`stickyDebounceMs`), which is what the headless Platform reports.
const DEBOUNCE_MS = 64;

type IChildSpec = 'row' | 'anchor' | 'sticky-tag';

interface IMounted {
  owner: ISymbioteNode;
  /** Only the `row`/`sticky-tag` children, in the order they were written. */
  rows: ISymbioteNode[];
  commit: () => IFakeNode;
  scroll: (y: number) => void;
  measure: (header: ISymbioteNode, y: number, height: number) => void;
}

function fire(target: ISymbioteNode, event: ISymbioteEvent): void {
  const listener = target.listeners?.get(event.type);
  if (listener === undefined)
    throw new Error(
      `no ${event.type} listener installed on ${target.component}`,
    );
  listener(event);
}

// Deliberately does NOT commit: the whole point of several of these rows is what the FIRST commit
// looks like, and a mount that swallowed it would hide the latency it is meant to expose.
function mountIndexed(
  children: readonly IChildSpec[],
  props: Readonly<Record<string, unknown>> = {},
): IMounted {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const owner = createElement(
    descriptorFor(SCROLL_VIEW_TAG).component,
    false,
    SCROLL_VIEW_TAG,
  );
  for (const key of Object.keys(props)) routeProp(owner, key, props[key]);

  const rows: ISymbioteNode[] = [];
  for (const spec of children) {
    if (spec === 'anchor') {
      appendChild(owner, createAnchor());
      continue;
    }
    const child =
      spec === 'sticky-tag'
        ? createElement(
            descriptorFor(STICKY_HEADER_TAG).component,
            false,
            STICKY_HEADER_TAG,
          )
        : createElement('RCTView');
    routeProp(child, 'testID', `row-${rows.length}`);
    appendChild(child, createElement('RCTText'));
    appendChild(owner, child);
    rows.push(child);
  }
  appendChild(root, owner);

  const commit = (): IFakeNode => {
    surface.commit();
    const latest = fabric.committed[fabric.committed.length - 1];
    const committed = latest?.children[0]?.children[0];
    if (committed === undefined)
      throw new Error('the scroll view never committed');
    return committed;
  };

  return {
    owner,
    rows,
    commit,
    scroll: y =>
      fire(owner, {
        type: 'scroll',
        target: owner,
        currentTarget: owner,
        nativeEvent: { contentOffset: { x: 0, y } },
        stopPropagation: () => {},
      }),
    measure: (header, y, height) =>
      fire(header, {
        type: 'layout',
        target: header,
        currentTarget: header,
        nativeEvent: { layout: { x: 0, y, width: 300, height } },
        stopPropagation: () => {},
      }),
  };
}

// The committed sticky wrappers, in document order — identified by the zIndex the pin needs, which
// is the one key only a sticky header carries. Read off the payload's TOP level, because
// `fabricProps` flattens the style slot straight into it.
function committedHeaders(scrollView: IFakeNode): IFakeNode[] {
  const found: IFakeNode[] = [];
  const walk = (fake: IFakeNode): void => {
    if (fake.props.zIndex === 10) found.push(fake);
    for (const child of fake.children) walk(child);
  };
  walk(scrollView);
  return found;
}

function committedTranslateY(fake: IFakeNode): unknown {
  const transform = fake.props.transform;
  if (!Array.isArray(transform)) return undefined;
  const entry: unknown = transform[transform.length - 1];
  if (typeof entry !== 'object' || entry === null) return undefined;
  return Reflect.get(entry, 'translateY');
}

// Which app child each committed wrapper holds. `testID` is what makes an index assertion readable
// as "index 1 addressed the SECOND row" rather than as a position in a fake tree.
function wrappedTestIds(scrollView: IFakeNode): unknown[] {
  return committedHeaders(scrollView).map(
    header => header.children[0]?.props.testID,
  );
}

// The synthesized wrapper standing over an app child, or undefined while it is still unwrapped.
function wrapperOf(child: ISymbioteNode): ISymbioteNode {
  const parent = child.parent;
  if (parent === undefined) throw new Error('the child is not in the tree');
  return parent;
}

beforeEach(() => {
  vi.useFakeTimers();
  registerScrollViewBehavior();
});

afterEach(() => {
  vi.useRealTimers();
  clearHostBehaviors();
  fabric.reset();
});

describe('an index selects a child the same way a tag marks one', () => {
  it('wraps ONE COMMIT LATE, which is what afterCommit costs', () => {
    const { commit } = mountIndexed(['row', 'row', 'row'], {
      stickyHeaderIndices: [1],
    });
    // `afterCommit` runs past `completeRoot`, so the frame that mounts the children paints them
    // unwrapped. Angular's controller avoids this only through a synchronous flush at
    // `RendererFactory2.end()`; a behavior has no such seam. On a device: a flagged header is
    // unpinned for one frame at mount, then pins.
    expect(committedHeaders(commit())).toHaveLength(0);
    expect(wrappedTestIds(commit())).toEqual(['row-1']);
  });

  it('numbers children the way RN does, skipping anchors', () => {
    // The control arm: no anchor, so the walk cannot be wrong about one.
    const plain = mountIndexed(['row', 'row', 'row'], {
      stickyHeaderIndices: [1],
    });
    plain.commit();
    expect(wrappedTestIds(plain.commit())).toEqual(['row-1']);

    // The arm that decides it. An uncorrected walk numbers the anchor 0 and wraps `row-0`.
    const anchored = mountIndexed(['anchor', 'row', 'row', 'row'], {
      stickyHeaderIndices: [1],
    });
    anchored.commit();
    expect(wrappedTestIds(anchored.commit())).toEqual(['row-1']);
  });

  it('gives the child back when the prop stops naming it', () => {
    const { owner, rows, commit } = mountIndexed(['row', 'row'], {
      stickyHeaderIndices: [1],
    });
    commit();
    expect(wrappedTestIds(commit())).toEqual(['row-1']);

    routeProp(owner, 'stickyHeaderIndices', []);
    commit();
    expect(committedHeaders(commit())).toHaveLength(0);
    // Back under the content view itself, not orphaned inside a wrapper nobody points at.
    expect(rows[1]?.parent).toBe(owner.childHost);
  });

  it('drops the wrapper when the framework takes its child away', () => {
    const { owner, rows, commit } = mountIndexed(['row', 'row'], {
      stickyHeaderIndices: [0],
    });
    commit();
    expect(wrappedTestIds(commit())).toEqual(['row-0']);

    // The framework removes from the node it appended to — the ScrollView — so the engine's
    // `removeChild` redirects to the SLOT, finds nothing to splice and only clears `child.parent`.
    // The wrapper is then a committed node holding a child nobody owns, and this walk is the only
    // thing that can notice. Left standing it keeps painting the removed row AND holds index 0, so
    // the row that really is first never gets a header.
    removeChild(owner, rows[0] as ISymbioteNode);
    commit();
    expect(wrappedTestIds(commit())).toEqual(['row-1']);
  });

  it('consumes the two props rather than committing them', () => {
    const { owner, commit } = mountIndexed(['row'], {
      stickyHeaderIndices: [0],
      invertStickyHeaders: true,
    });
    const committed = commit();
    // The positive control: the app really did write them, and the behavior really does read them.
    expect(owner.props.stickyHeaderIndices).toEqual([0]);
    expect(Object.hasOwn(committed.props, 'stickyHeaderIndices')).toBe(false);
    expect(Object.hasOwn(committed.props, 'invertStickyHeaders')).toBe(false);
  });
});

describe('the wrap composes, it does not overwrite', () => {
  it('leaves the child its own transform and pins the wrapper', () => {
    const { rows, commit, scroll, measure } = mountIndexed(['row'], {
      stickyHeaderIndices: [0],
    });
    const child = rows[0] as ISymbioteNode;
    routeProp(child, 'style', { transform: [{ scale: 2 }] });
    commit();
    commit();

    measure(wrapperOf(child), 0, 50);
    scroll(120);
    vi.advanceTimersByTime(DEBOUNCE_MS);

    const [header] = committedHeaders(commit());
    if (header === undefined) throw new Error('no sticky header committed');
    expect(committedTranslateY(header)).toBe(120);
    // The trap this wrap exists for: `fabricProps.addStyle` hoists style keys into ONE payload and
    // later entries win, so a pin written straight onto the child would REPLACE this rather than
    // compose over it. RN's two nested views are what compose.
    expect(header.children[0]?.props.transform).toEqual([{ scale: 2 }]);

    // The control that makes the line above a finding rather than a coincidence — the same two
    // values composed onto ONE node, which is what the shortcut would produce.
    routeProp(child, 'style', [
      { transform: [{ scale: 2 }] },
      { transform: [{ translateY: 120 }] },
    ]);
    expect(committedHeaders(commit())[0]?.children[0]?.props.transform).toEqual(
      [{ translateY: 120 }],
    );
  });
});

describe('an unsorted index list resolves by DOCUMENT order', () => {
  it('feeds each header the collision point BELOW it, not the next array entry', () => {
    const { rows, commit, scroll, measure } = mountIndexed(
      ['row', 'row', 'row'],
      // Deliberately descending. React reads the next header out of the ARRAY
      // (`ScrollView.js:1695`), which would give index 0 no successor at all here and let its
      // header ride the offset straight over the one below it.
      { stickyHeaderIndices: [2, 0] },
    );
    commit();
    commit();

    const first = wrapperOf(rows[0] as ISymbioteNode);
    const third = wrapperOf(rows[2] as ISymbioteNode);
    measure(first, 0, 50);
    measure(third, 300, 50);

    scroll(400);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    // 250 = the third header's y minus the first one's height: past that the first is pushed off
    // rather than pinned. Array order would read 400.
    expect(
      committedTranslateY(committedHeaders(commit())[0] as IFakeNode),
    ).toBe(250);
  });
});

describe('the tag form and the index form share a scroll view', () => {
  it('counts a written sticky-header as a child without wrapping it twice', () => {
    const { owner, rows, commit } = mountIndexed(['sticky-tag', 'row', 'row'], {
      stickyHeaderIndices: [2],
    });
    commit();
    const committed = commit();

    // Two headers in document order: the written one, whose own child is its text, and the
    // synthesized one holding `row-2`. A tag header nested inside a synthesized header would pin
    // twice, so the first entry reading `undefined` is the assertion, not noise.
    expect(wrappedTestIds(committed)).toEqual([undefined, 'row-2']);
    // Index 2 addresses the third child, so the tag header counted as index 0 like any other.
    expect(rows[0]?.parent).toBe(owner.childHost);
  });

  it('leaves a written sticky-header alone when an index also names it', () => {
    const { owner, rows, commit } = mountIndexed(['sticky-tag', 'row'], {
      stickyHeaderIndices: [0],
    });
    commit();
    // Both forms agreeing on one child must produce ONE header. Nested, the outer pin wins and the
    // inner one translates relative to it, so the child rides at twice the offset.
    expect(committedHeaders(commit())).toHaveLength(1);
    expect(rows[0]?.parent).toBe(owner.childHost);
  });
});
