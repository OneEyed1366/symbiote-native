// A targeted replace must leave every SIBLING it did not touch still reachable — by tag, and by the
// event the platform aims at that tag.
//
// why: device regression 2026-09-17, the first Release build carrying the re-enabled
// `canReplaceInPlace`. Taps did nothing, a slider moved its thumb without its label following,
// `findNodeHandle` printed "native tag —", and a drag reported `dx 0 dy 0` while visibly dragging.
// Every one of those is the same shape: the view is on screen and the platform is talking to it, but
// the JS side can no longer name it. Nothing in the existing suite catches that — 128 itests, 317
// C++ tests and 5 552 vitest tests were green on the build that shipped it, because every one of
// them asks what the COMMITTED TREE looks like and none asks whether JS can still address it
// afterwards.
//
// The targeted path only rewrites the slots that moved. The siblings it skips keep pointers that
// were minted against an earlier revision of the parent, so "did the untouched neighbour survive" is
// exactly the question this path puts at risk and exactly the one no shape assertion covers.
//
// **IT PASSES, AND IT DOES NOT YET REPRODUCE THE DEVICE BUG — read that before trusting it.** On
// this fixture — a flat list of `RCTView`s with touch listeners, one layout-neutral prop change, the
// targeted path confirmed taken — tags survive and events arrive for the changed row and its
// untouched siblings alike. So whatever breaks the app is NOT reached here, and the gap is what this
// fixture lacks against a real screen: host behaviors (Pressable's press machine, `childHost`,
// wrappers), third-party native views (the slider), `setNativeProps`, and the deferred-attach path.
// That is where the next fixture has to go.
//
// It earns its place anyway as the shape no other file asserts, and as the record of how it was
// nearly misread: two earlier versions of this file reported ZERO arrivals and looked exactly like
// the device regression. Both were the fixture — first an interceptor registered before
// `createSurface` replaced it, then a counter read before the beat had turned. A control that taps
// BEFORE anything changes is what told them apart, and it is why that assertion is first.

import {
  appendChild,
  createElement,
  createSurface,
  getNativeTag,
  readSurfaceTelemetry,
  routeProp,
  setEventListener,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  describe,
  dispatchEvent,
  expect,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 24;
/** The row the change lands on. Every assertion below is about a DIFFERENT row. */
const TOUCHED = 12;
const UNTOUCHED = 5;

const ROW_STYLE = { height: 44, flexDirection: 'row' };

const TOUCH = {
  touches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
  changedTouches: [{ identifier: 1, pageX: 12, pageY: 4, target: 0 }],
  identifier: 1,
  pageX: 12,
  pageY: 4,
};

let rows: ISymbioteNode[] = [];
let surface: ReturnType<typeof createSurface> | undefined;

function build(): void {
  surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flexDirection: 'column' });
  surface.appendChild(list);

  rows = [];
  for (let id = 0; id < ROWS; id += 1) {
    const row = createElement('RCTView');
    routeProp(row, 'style', ROW_STYLE);
    routeProp(row, 'nativeID', `row-${id}`);
    // The listener is what makes this node a real event TARGET; the interceptor below is what counts
    // arrivals, so the body has nothing to do.
    setEventListener(row, 'onTouchStart', () => {});
    appendChild(list, row);
    rows.push(row);
  }
  surface.commit();
  mounted();
}

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// INTERCEPT THE SLOT, and register AFTER the surface exists. `createSurface` installs the ENGINE's
// own handler through this same `registerEventHandler`, so an interceptor registered first is simply
// replaced and every arrival reads zero — which is the false alarm this file produced twice before
// the control caught it. This is engine-boot's proven shape; what it answers is "did the event reach
// JS at all, carrying the node it was aimed at", which is the half a targeted replace can break.
const arrivals: { handle: unknown; type: string }[] = [];

function interceptEvents(): void {
  const slot: unknown = (globalThis as Record<string, unknown>)
    .nativeFabricUIManager;
  if (
    slot !== null &&
    typeof slot === 'object' &&
    'registerEventHandler' in slot &&
    typeof slot.registerEventHandler === 'function'
  ) {
    slot.registerEventHandler((handle: unknown, type: string) => {
      arrivals.push({ handle, type });
    });
  }
}

/** Aim a touch at the mounted view carrying this row's `nativeID`; 1 when it reached that row. */
async function tap(id: number): Promise<number> {
  arrivals.length = 0;
  dispatchEvent(mountedRow(id)?.tag ?? -1, 'touchStart', TOUCH);
  await tick();
  return arrivals.filter(one => one.handle === rows[id]).length;
}

function surfaceOf(): ReturnType<typeof createSurface> {
  if (surface === undefined) throw new Error('no surface open');
  return surface;
}

/** The mounted view carrying this `nativeID`, wherever the differ put it. */
function mountedRow(id: number): { tag: number } | undefined {
  const found: { tag: number }[] = [];
  const walk = (view: {
    tag: number;
    props: Record<string, string>;
    children: {
      tag: number;
      props: Record<string, string>;
      children: never[];
    }[];
  }): void => {
    if (view.props.nativeID === `row-${id}`) found.push({ tag: view.tag });
    for (const child of view.children) walk(child);
  };
  walk(mounted());
  return found[0];
}

type IProbe = {
  arrivalsBeforeChange: number;
  replaces: number;
  tagBefore: number | undefined;
  tagAfter: number | undefined;
  tagTouched: number | undefined;
  arrivalsUntouched: number;
  arrivalsTouched: number;
};

// ONE case for the whole scenario, deliberately: the harness resets the surface and the shadow-tree
// registry between cases, so a second `it` would be asserting against a fresh tree and the nodes
// this file holds would belong to a surface that no longer exists. Found the hard way — the split
// version aborted inside `readSurfaceTelemetry` on a revision no commit had ever stamped.
async function probe(): Promise<IProbe> {
  build();
  interceptEvents();
  const tagBefore = getNativeTag(rows[UNTOUCHED]);

  // THE CONTROL, and without it this file cannot tell a broken path from a broken fixture. If the
  // tap does not land HERE — before anything has been changed, on a plain freshly mounted tree —
  // then the targeted replace is not what this test is measuring. It read zero once already.
  const arrivalsBeforeChange = await tap(UNTOUCHED);

  readSurfaceTelemetry(ROOT_TAG);
  routeProp(rows[TOUCHED], 'style', {
    ...ROW_STYLE,
    backgroundColor: '#f5a524',
  });
  surfaceOf().commit();
  mounted();
  const replaces = readSurfaceTelemetry(ROOT_TAG)?.targetedReplaces ?? 0;

  return {
    arrivalsBeforeChange,
    replaces,
    tagBefore,
    tagAfter: getNativeTag(rows[UNTOUCHED]),
    tagTouched: getNativeTag(rows[TOUCHED]),
    arrivalsUntouched: await tap(UNTOUCHED),
    arrivalsTouched: await tap(TOUCHED),
  };
}

describe('a targeted replace leaves its untouched siblings addressable', () => {
  it('keeps every row reachable by tag and by event after one row changes', async () => {
    const one = await probe();
    print(
      `DEBUG arrivalsBeforeChange=${one.arrivalsBeforeChange} ` +
        `targetedReplaces=${one.replaces} ` +
        `tag before=${String(one.tagBefore)} after=${String(one.tagAfter)} ` +
        `touched=${String(one.tagTouched)}`,
    );
    print(
      `DEBUG taps landed: untouched=${one.arrivalsUntouched} touched=${one.arrivalsTouched}`,
    );

    // why: the control. A fixture that cannot deliver a tap on an untouched tree reports the same
    // zero a real regression does, and this file already produced that false alarm once.
    expect(one.arrivalsBeforeChange).toBe(1);
    // why: a zero here means the commit took the full-handover path and this file proves nothing
    // about the targeted one — green by absence, the failure mode it exists to prevent.
    expect(one.replaces > 0).toBe(true);
    expect(one.tagBefore !== undefined).toBe(true);
    expect(one.tagAfter !== undefined).toBe(true);
    expect(one.tagTouched !== undefined).toBe(true);
    // why: the tag is only half of it — the device symptom was a mounted view whose taps reached
    // nothing, so the listener the engine registered has to keep firing.
    expect(one.arrivalsUntouched).toBe(1);
    expect(one.arrivalsTouched).toBe(1);
  });
});

report();
