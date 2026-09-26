// require('./x.png') asset ids and {uri} sources resolve via RN's own resolveAssetSource, which is
// platform-specific and injected here rather than imported (mirrors platform-color.ts's
// processColor seam) so @symbiote-native/components stays free of a react-native dependency.

let sourceResolver: (source: unknown) => unknown = source => source;

export function setImageSourceResolver(
  resolve: (source: unknown) => unknown,
): void {
  sourceResolver = resolve;
}

// Public mirror of RN's Image.resolveAssetSource: run a source through the injected resolver.
// Headless (no resolver wired) it is the identity, so smokes see the input unchanged.
export function resolveImageSource(source: unknown): unknown {
  return sourceResolver(source);
}

// A source is a structured object/array (remote or pre-resolved) or an opaque asset id (the
// number `require('./x.png')` returns). Defined here, not in @symbiote-native/components, since
// components depends on engine, never the reverse; render-image.ts re-exports these verbatim.
export type IImageSource = {
  uri?: string;
  scale?: number;
  width?: number;
  height?: number;
};

export type IImageSourceProp = IImageSource | IImageSource[] | number;
