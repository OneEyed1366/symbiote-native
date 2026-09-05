// `NativeDOM` is RN's own TurboModule behind the DOM node APIs (`ReadOnlyNode`'s childNodes /
// parentNode). It ships as FLOW source at a private path, so TypeScript cannot read its types —
// but the path IS importable, because react-native's package.json `exports` carries "./src/*".
//
// Declared ambiently rather than reached through `require()`: RN 0.86 ships no global `require`
// declaration in its own types (checked against the 0.86.0 tarball's types/), so a require call
// costs a TS2580 plus a lint disable, and buys nothing over this.
//
// Only the two navigation reads are declared — the ones `JsiNavigationCostScreen` prices. The real
// module carries ~20 more (getBoundingClientRect, getScrollPosition, getTagName …); add them here
// as they are needed rather than mirroring the whole spec, which would rot silently.
declare module 'react-native/src/private/webapis/dom/nodes/specs/NativeDOM' {
  /**
   * Both take the same ShadowNode reference the engine already holds in its committed record
   * (reachable via the engine's `getNativeNode`), and both answer against the CURRENT REVISION:
   * a node that is not in it yields an empty array / null. That is why these can price the JSI
   * boundary but cannot serve a reconciler, which navigates the tree it is mid-way building.
   */
  export interface INativeDOM {
    getChildNodes(reference: object): readonly object[];
    getParentNode(reference: object): object | null;
  }

  // `TurboModuleRegistry.get`, not `getEnforcing` — RN's own spec file says so, so this is `null`
  // on a host without the module rather than a throw at import time.
  const NativeDOM: INativeDOM | null;
  export default NativeDOM;
}
