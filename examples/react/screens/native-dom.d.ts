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
   * The INPUT type. What the engine holds in its committed record and hands out through
   * `getNativeNode` — RN's spec calls it `NativeNodeReference`.
   */
  export type INativeNodeReference = object & {
    readonly __nativeNodeReference: unique symbol;
  };

  /**
   * The OUTPUT type, and it is NOT the input type — RN's own spec has both reads TAKING a
   * `NativeNodeReference` and RETURNING `InstanceHandle`s. Nothing converts one to the other from
   * JS; a child's reference comes from that child's own host instance.
   *
   * Declared as a distinct brand because the two were both `object` here, so the compiler could not
   * see the difference and did not — `getParentNode(getChildNodes(ref)[0])` type-checked, shipped,
   * and crashed on the first device run with "Exception in HostFunction: Value is not a ShadowNode
   * reference". Neither type is ever constructed in TS, so the brands cost nothing at runtime and
   * make that call a compile error.
   */
  export type IInstanceHandle = object & {
    readonly __instanceHandle: unique symbol;
  };

  /**
   * Both answer against the CURRENT REVISION: a node that is not in it yields an empty array /
   * null. That is why these can price the JSI boundary but cannot serve a reconciler, which
   * navigates the tree it is mid-way building.
   */
  export interface INativeDOM {
    getChildNodes(reference: INativeNodeReference): readonly IInstanceHandle[];
    getParentNode(reference: INativeNodeReference): IInstanceHandle | null;
  }

  // `TurboModuleRegistry.get`, not `getEnforcing` — RN's own spec file says so, so this is `null`
  // on a host without the module rather than a throw at import time.
  const NativeDOM: INativeDOM | null;
  export default NativeDOM;
}
