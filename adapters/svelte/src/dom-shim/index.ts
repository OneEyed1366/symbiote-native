// Internal barrel — consumed by render.ts and root-element.ts, never by app code (app code
// never sees a shim class or a `symbiote-*` tag; see the adapter's own index.ts).

export { patchGlobals, restoreGlobals } from './patch-globals';
export { ShimElement } from './element';
// ShimComment is the anchor path (engine createAnchor, flattened away by the commit walk) — the
// only shim node create-portal can use as a non-painting fragment host.
export { ShimComment } from './comment';
export { ShimNode } from './shim-node';
export { ShimText } from './text';
export { getShimDocument } from './document';
