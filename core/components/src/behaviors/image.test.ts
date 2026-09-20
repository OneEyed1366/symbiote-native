// The ONE thing Image's behavior still does, and the one thing the C++ contract cannot prove.
//
// WHAT THIS FILE USED TO BE. It asserted that the behavior's fold produced the same payload as
// `mapImageProps`, and that the fold was idempotent. Both questions are gone rather than moved:
// there is one implementation now (`foldImageProps` in `SymbioteFabricProps.cpp`, contract in
// `core/engine/cpp/tests/js/image-payload.itest.ts`), so there is no second producer to agree with,
// and it runs at one point in the commit, so a bag cannot reach it twice.
//
// WHAT REPLACED THEM is the half the port could NOT take across: `resolveAssetSource` asks Metro's
// asset registry, which is a JS table, so the lookup happens at WRITE time
// (`core/engine/src/image-source-write.ts`) and the payload builder only ever sees resolved
// sources. The itest runs with the identity resolver and therefore cannot tell whether the resolver
// is called at all — that is this file's question, and it is the one that fails on device if the
// wiring breaks: an unresolved asset id reaches Fabric as a number and paints nothing.

import { afterEach, describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  routeProp,
  setImageSourceResolver,
  type ISymbioteNode,
} from '@symbiote-native/engine';
// By relative path, as this package's other behavior tests reach it: `core/components` does not
// declare `@symbiote-native/test-utils` as a dependency.
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import { registerImageBehavior } from './image';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
registerImageBehavior();

let nextRootTag = 9_700;
const TEST_ID = 'probe';

afterEach(() => {
  // Restore the identity resolver so a case cannot leak into the next.
  setImageSourceResolver(source => source);
});

/** Commit one node and hand back the props the OPS carried — which is where the write landed. */
function commitTag(
  tag: string,
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  fabric.reset();
  const node: ISymbioteNode = createElement('RCTImageView', false, tag);
  routeProp(node, 'testID', TEST_ID);
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();

  const found = live.findLive(
    live.appRoot(),
    candidate => candidate.payload.testID === TEST_ID,
  );
  if (found === undefined) throw new Error('the subject never reached Fabric');
  return found.props;
}

describe('an image tag resolves its sources on the way in', () => {
  // why: this is what `require('./logo.png')` depends on. The number is an index into Metro's asset
  // registry and means nothing to native; if the resolver is not reached, Fabric gets the number.
  it('runs source through the installed resolver, and normalises to the array shape', () => {
    setImageSourceResolver(() => ({ uri: 'file://resolved.png', scale: 2 }));

    expect(commitTag('image', { source: 7 }).source).toEqual([
      { uri: 'file://resolved.png', scale: 2 },
    ]);
  });

  // why: the placeholder and the Android spinner go through the SAME resolver — an asset id is an
  // asset id whichever prop holds it, and a raw one reaches native just as unresolved.
  it('resolves the other two source props the same way', () => {
    setImageSourceResolver(source => ({ ...Object(source), scale: 3 }));
    const props = commitTag('image', {
      defaultSource: { uri: 'http://x/placeholder.png' },
      loadingIndicatorSource: { uri: 'http://x/spinner.gif' },
    });

    expect(props.defaultSource).toEqual([
      { uri: 'http://x/placeholder.png', scale: 3 },
    ]);
    expect(props.loadingIndicatorSource).toEqual([
      { uri: 'http://x/spinner.gif', scale: 3 },
    ]);
  });

  // why: an already-resolved array must not be wrapped again. A source arrives resolved on every
  // re-render after the first, so double-wrapping would break the second commit and not the first.
  it('leaves an array source as one array', () => {
    const resolved = commitTag('image', {
      source: [{ uri: 'http://x/1.png', scale: 1 }],
    }).source;

    expect(resolved).toEqual([{ uri: 'http://x/1.png', scale: 1 }]);
  });

  // why: THE CONTROL, and it is the reason the resolution is gated on the node rather than on the
  // key. `source` is not Image's alone — a WebView and every third-party video view spell it too,
  // and they read a bare object. Wrapping theirs would hand native a shape it does not understand.
  it('leaves a tag with no image behavior alone', () => {
    setImageSourceResolver(() => ({ uri: 'file://resolved.png' }));

    expect(
      commitTag('view', { source: { uri: 'http://x/1.png' } }).source,
    ).toEqual({ uri: 'http://x/1.png' });
  });
});

// why: `ReactImageView.setShouldNotifyLoadEvents` — Android's `downloadListener` stays `null`
// until this prop is `true`, so `onLoadStart`/`onLoad`/`onLoadEnd`/`onError` NEVER fire on Android
// without it, whatever the app wires (`ReactImageView.kt`). `Image.android.js` sets it whenever any
// one of the four is authored; iOS never sets it at all (its native side has no such gate). A
// function prop cannot cross the JSI wire as a value (`node.ts`'s `functionProps` stash), so this
// has to be a boolean the write path synthesizes — the same shape `GATED_EVENT_PROPS` uses for
// `onLayout`, applied to a name no host behavior owns.
describe('an image tag reports whether native should notify load events', () => {
  it('sets shouldNotifyLoadEvents when any load callback is authored', () => {
    expect(
      commitTag('image', { onLoad: () => {} }).shouldNotifyLoadEvents,
    ).toBe(true);
  });

  it('leaves it unset when no load callback is authored', () => {
    expect(
      commitTag('image', { source: { uri: 'http://x/1.png' } })
        .shouldNotifyLoadEvents,
    ).toBe(undefined);
  });

  it('stays true while at least one of the four remains wired', () => {
    fabric.reset();
    const node: ISymbioteNode = createElement('RCTImageView', false, 'image');
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onLoadStart', () => {});
    routeProp(node, 'onError', () => {});
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(node);
    surface.commit();

    routeProp(node, 'onLoadStart', undefined);
    surface.commit();

    const found = live.findLive(
      live.appRoot(),
      candidate => candidate.payload.testID === TEST_ID,
    );
    expect(found?.props.shouldNotifyLoadEvents).toBe(true);
  });

  it('clears once the last load callback is removed', () => {
    fabric.reset();
    const node: ISymbioteNode = createElement('RCTImageView', false, 'image');
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onLoad', () => {});
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(node);
    surface.commit();

    routeProp(node, 'onLoad', undefined);
    surface.commit();

    const found = live.findLive(
      live.appRoot(),
      candidate => candidate.payload.testID === TEST_ID,
    );
    expect(found?.props.shouldNotifyLoadEvents).toBe(undefined);
  });
});
