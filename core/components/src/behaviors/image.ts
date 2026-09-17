// Image's host behavior, and it carries no runtime at all — no listeners, no timers, no commit
// hook, and since 2026-09-18 no fold either. What is left is ONE declaration: that this tag's three
// source props are resolved on the way in.
//
// WHERE THE FOLD WENT: `foldImageProps` in `SymbioteFabricProps.cpp`, with
// `core/engine/cpp/tests/js/image-payload.itest.ts` as its contract. The `srcSet`/`src`/`source`
// precedence, the W3C header decoration, the `width`/`height` fold into style, `alt` becoming
// `accessibilityLabel` + `accessible`, `resizeMode`/`tintColor` falling back to style keys, and
// `loadingIndicatorSource` being plucked down to a bare uri — all of it is a function of the tag,
// which is what makes it the platform's.
//
// WHY THIS ONE DID NOT MOVE WHOLE, and it is the first that did not. `resolveAssetSource` turns the
// number `require('./logo.png')` returns into a `{uri, width, height, scale}` by asking METRO'S
// ASSET REGISTRY — a JS module populated at bundle time. There is no such table in C++ and there
// should not be: it belongs to the bundler, not to the platform.
//
// So the lookup moved EARLIER rather than across. `resolvesImageSources` tells `routeProp` to run
// the three source props through the resolver on the way IN, exactly as it already resolves
// `boxShadow`/`filter`/`transform` (`structured-style.ts`), and for the identical reason: a value
// resolved at payload-build time is resolved HEADLESS ONLY, because the C++ builder has no JS to
// call, and the device then commits the raw input for Fabric to drop in silence.
//
// The idempotence this file used to pin is GONE as a question rather than as a property. It
// mattered because `renderImage` folded too and a re-render could hand the fold its own output;
// there is one implementation now, at one point in the commit, so a bag cannot be folded twice.
import {
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export const IMAGE_TAG = 'image';

// Required by IHostBehavior and deliberately empty: Image owns no per-node runtime. Written out
// rather than shared with a `noop` helper so the emptiness reads as a decision.
function attach(_node: ISymbioteNode): void {
  // nothing to set up
}

function detach(_node: ISymbioteNode): void {
  // nothing to release
}

export function registerImageBehavior(): void {
  registerHostBehavior(IMAGE_TAG, {
    attach,
    detach,
    resolvesImageSources: true,
  });
}
