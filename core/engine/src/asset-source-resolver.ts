// Generic asset-id resolution seam, the non-Image sibling of image-source-resolver.ts. That file
// stays image-specific by name and precedent (renderImage, image-loader's statics); this one is
// for every OTHER package that needs RN's require()'d-asset resolution — audio's `number` source
// form today, sqlite's `assetSource` option later. Kept as a separate file rather than merged so a
// non-image consumer never has to import something named "image" to resolve its own assets.

let sourceResolver: (source: unknown) => unknown = source => source;

export function setAssetSourceResolver(
  resolve: (source: unknown) => unknown,
): void {
  sourceResolver = resolve;
}

// Public mirror of image-source-resolver.ts's resolveImageSource, for non-Image consumers of RN's
// require()'d-asset resolution (audio's `number` source form, sqlite's `assetSource` option).
// Headless (no resolver wired) it is the identity, so smokes see the input unchanged.
export function resolveAssetSource(source: unknown): unknown {
  return sourceResolver(source);
}
