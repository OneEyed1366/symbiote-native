// Sticky headers as a CHILD rather than an index — step 4c of the tag migration.
//
// WHAT THIS PROVES, and the order matters: a `<StickyHeader>` in the tree makes the ScrollView
// behave as `stickyHeaderIndices` makes a wrapper behave (the raised throttle, the scroll value,
// the pin), and it does the one thing indices cannot — feed each header the NEXT header's y with
// nothing to renumber.
//
// The pin math itself is NOT re-tested here: `computeStickyInterpolation` / `reduceSticky` are
// exhaustively covered at `state/sticky-header-reducer.test.ts` and are shared with every
// adapter's own sticky component. What is new is the RUNNER — the fourth implementation of those
// effects and the first with no framework above it — and the owner-side registration that feeds it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installFabric,
  type IFakeNode,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
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
let nextRootTag = 9800;

// iOS's debounce window (`stickyDebounceMs`), which is what the headless Platform reports. The
// committed translateY only appears once it fires.
const DEBOUNCE_MS = 64;

function node(tag: string): ISymbioteNode {
  return createElement(descriptorFor(tag).component, false, tag);
}

interface IMounted {
  owner: ISymbioteNode;
  headers: ISymbioteNode[];
  commit: () => IFakeNode;
  scroll: (y: number) => void;
  measure: (header: ISymbioteNode, y: number, height: number) => void;
}

// One ScrollView with `count` sticky headers, each with a plain child so the tree is the shape an
// app writes. Committed once, which is what registers them — `attachAfterCommit` is where a header
// can first see a parent at all.
function mountSticky(
  count: number,
  props: Readonly<Record<string, unknown>> = {},
): IMounted {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const owner = node(SCROLL_VIEW_TAG);
  for (const key of Object.keys(props)) routeProp(owner, key, props[key]);
  const headers: ISymbioteNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const header = node(STICKY_HEADER_TAG);
    appendChild(header, createElement('RCTText'));
    appendChild(owner, header);
    headers.push(header);
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
  commit();

  const fire = (target: ISymbioteNode, event: ISymbioteEvent): void => {
    const listener = target.listeners?.get(event.type);
    if (listener === undefined)
      throw new Error(`no ${event.type} listener installed`);
    listener(event);
  };

  return {
    owner,
    headers,
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

// The committed sticky wrappers, in document order. Identified by the zIndex the pin needs to
// paint over the rows scrolling under it, which is the one key only a sticky header carries — and
// read off the payload's TOP level, because `fabricProps` flattens the style slot straight into it.
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

beforeEach(() => {
  vi.useFakeTimers();
  registerScrollViewBehavior();
});

afterEach(() => {
  vi.useRealTimers();
  clearHostBehaviors();
  fabric.reset();
});

describe('a sticky header child is what the index array could not be', () => {
  it('commits under the content node carrying the wrapper own two constants', () => {
    const { commit } = mountSticky(1);
    const [header] = committedHeaders(commit());
    if (header === undefined) throw new Error('no sticky header committed');
    // Yoga flattens a view that only groups children, and a flattened header has no transform to
    // animate — RN's own sticky wrapper sets both for the same reason.
    expect(header.props.collapsable).toBe(false);
    expect(header.children[0]?.viewName).toBe('RCTText');
  });

  it('raises the scroll throttle the way a wrapper does, and takes it back', () => {
    const { owner, headers, commit } = mountSticky(1);
    // 16, not 1: the JS fallback is the only correct bootstrap here — a scroll value made native
    // up front stops cascading to the child listeners before the first tick reaches them.
    expect(commit().props.scrollEventThrottle).toBe(16);

    removeChild(owner, headers[0] as ISymbioteNode);
    // Fabric has no prop removal, so a key that disappears commits as an explicit null.
    expect(commit().props.scrollEventThrottle).toBeNull();
  });

  it('leaves an app throttle alone', () => {
    const { commit } = mountSticky(1, { scrollEventThrottle: 8 });
    expect(commit().props.scrollEventThrottle).toBe(8);
  });
});

describe('the pin', () => {
  it('translates with the offset once the header has measured', () => {
    const { headers, commit, scroll, measure } = mountSticky(1);
    measure(headers[0] as ISymbioteNode, 0, 50);
    scroll(120);
    // TWO writers land on this key and they converge: the animated leaf pushes the live value
    // through `setNativeProps` on every tick, and the debounced explicit value goes into the
    // payload at the next commit (RN's hit-testing sync). So the assertion is taken past the
    // debounce, where both have written — expecting the key to be ABSENT before it is wrong, and
    // was the first thing this row got wrong.
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(
      committedTranslateY(committedHeaders(commit())[0] as IFakeNode),
    ).toBe(120);
  });

  it('survives a re-render writing the style out from under it', () => {
    const { headers, commit, scroll, measure } = mountSticky(1);
    measure(headers[0] as ISymbioteNode, 0, 50);
    scroll(120);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    // The animated pin lives in `node.props.style`, which a framework re-render REPLACES. RN keeps
    // the settled value beside the animated one for exactly this; here it is the payload fold, and
    // without it a header goes back to its resting place the next time the app touches its style.
    routeProp(headers[0] as ISymbioteNode, 'style', { opacity: 0.5 });
    expect(
      committedTranslateY(committedHeaders(commit())[0] as IFakeNode),
    ).toBe(120);
  });

  it('stops at the NEXT header, which is the whole reason a header is a child', () => {
    const { headers, commit, scroll, measure } = mountSticky(2);
    measure(headers[0] as ISymbioteNode, 0, 50);
    measure(headers[1] as ISymbioteNode, 300, 50);

    scroll(400);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    // 250 = the second header's y minus the first one's height: past that point the first header is
    // pushed off rather than pinned. With no cross-talk it would read 400 — the header would ride
    // the offset forever, straight over its successor.
    expect(
      committedTranslateY(committedHeaders(commit())[0] as IFakeNode),
    ).toBe(250);
  });
});

describe('the owner keeps every listener it borrowed', () => {
  it('forwards the app onScroll it had to displace', () => {
    const seen: number[] = [];
    const { scroll } = mountSticky(1, {
      onScroll: (event: ISymbioteEvent) => {
        const offset = Reflect.get(
          Reflect.get(event.nativeEvent as object, 'contentOffset') as object,
          'y',
        );
        if (typeof offset === 'number') seen.push(offset);
      },
    });
    scroll(42);
    expect(seen).toEqual([42]);
  });

  it('forwards the app onLayout on the header it drives', () => {
    const seen: unknown[] = [];
    const { headers, measure } = mountSticky(1);
    routeProp(headers[0] as ISymbioteNode, 'onLayout', (event: unknown) => {
      seen.push(event);
    });
    measure(headers[0] as ISymbioteNode, 0, 50);
    expect(seen).toHaveLength(1);
  });

  it('takes the owner layout only when an inverted pin needs it', () => {
    // `onLayout` is a gated event: the flag reaching a ScrollView that reads no layout is the
    // divergence this whole path exists to avoid.
    expect(Object.hasOwn(mountSticky(1).commit().props, 'onLayout')).toBe(
      false,
    );
    expect(
      mountSticky(1, { invertStickyHeaders: true }).commit().props.onLayout,
    ).toBe(true);
  });

  it('gives the owner layout back when the last inverted header leaves', () => {
    const { owner, headers, commit } = mountSticky(1, {
      invertStickyHeaders: true,
    });
    expect(commit().props.onLayout).toBe(true);
    removeChild(owner, headers[0] as ISymbioteNode);
    // A one-way installer would leave the gate flag standing on a ScrollView that reads no layout
    // — the same divergence an unwired `onContentSizeChange` gets caught for.
    expect(commit().props.onLayout).toBeNull();
    expect(owner.listeners?.get('layout')).toBeUndefined();
  });

  it('keeps the owner layout for the app after the last header leaves', () => {
    const seen: unknown[] = [];
    const { owner, headers, commit } = mountSticky(1, {
      invertStickyHeaders: true,
      onLayout: (event: unknown) => {
        seen.push(event);
      },
    });
    removeChild(owner, headers[0] as ISymbioteNode);
    // The sticky claim is gone and the app's is not — one resolver owns the slot, so neither claim
    // can uninstall the other's.
    expect(commit().props.onLayout).toBe(true);
    owner.listeners?.get('layout')?.({
      type: 'layout',
      target: owner,
      currentTarget: owner,
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 600 } },
      stopPropagation: () => {},
    });
    expect(seen).toHaveLength(1);
  });
});
