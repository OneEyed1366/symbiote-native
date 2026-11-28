// `MapMarker` of react-native-maps (a 165 LOC class) emitted by hand into the shared core
// `[auto]` marks what a class-to-core generator could emit mechanically, `[hand]` needs a decision
import { dispatchViewCommand } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';

// `ProviderConstants.ts:2` upstream, a real emission imports it
const PROVIDER_GOOGLE = 'google';
type ILatLng = { latitude: number; longitude: number };

export type IMapMarkerPlatform = {
  os: 'ios' | 'android';
  // [hand] upstream reads `this.context` (`ProviderContext`), here the adapter supplies it
  provider: string | undefined;
  // [hand] a module-level native probe upstream
  googleMapIsInstalled: boolean;
};

// [auto] six methods proxying one command each, the `this.marker.current` guard becomes
// the "node not committed" skip of `dispatchViewCommand`
export function createMapMarkerCommands(getNode: () => ISymbioteNode | null) {
  const run = (name: string, args: readonly unknown[]) => {
    const node = getNode();
    if (node) dispatchViewCommand(node, name, args);
  };
  return {
    showCallout: () => run('showCallout', []),
    hideCallout: () => run('hideCallout', []),
    redrawCallout: () => run('redrawCallout', []),
    redraw: () => run('redraw', []),
    setCoordinates: (c: ILatLng) => run('setCoordinates', [c.latitude, c.longitude]),
    animateMarkerToCoordinate: (c: ILatLng, duration = 500) =>
      run('animateToCoordinates', [c.latitude, c.longitude, duration]),
  };
}

// NOTE: [hand] upstream caches this on `this` at the FIRST render, so a later provider change
// is ignored. This one is pure, so the adapter has to snapshot it at mount
export function isFabricMarker(p: IMapMarkerPlatform): boolean {
  return !(p.os === 'ios' && p.provider === PROVIDER_GOOGLE) || p.googleMapIsInstalled;
}

// [hand] `fixImageProp` resolves assets through the Metro registry, so it stays in JS
type IImageProp = unknown;
export type IMapMarkerView = {
  image?: IImageProp;
  icon?: IImageProp;
  style?: unknown;
  stopPropagation?: boolean;
  // `{...this.props}` upstream
  passthrough: Record<string, unknown>;
};

function uriOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('uri' in value)) return undefined;
  return typeof value.uri === 'string' ? value.uri : undefined;
}

// [auto] the `render()` body: a branch on `fabricMarker` shaping image and icon, pure
export function renderMapMarker(
  view: IMapMarkerView,
  platform: IMapMarkerPlatform,
  fixImage: (v: IImageProp) => unknown,
): IDescriptor {
  const fabric = isFabricMarker(platform);
  const shape = (v: IImageProp) => {
    if (!v) return v;
    const fixed = fixImage(v);
    const uri = uriOf(fixed);
    // Upstream: `if (image.uri) image = image.uri`
    return fabric || !uri ? fixed : uri;
  };
  return el('AIRMapMarker', {
    ...view.passthrough,
    image: shape(view.image),
    icon: shape(view.icon),
    // [auto] `styles.marker`
    style: [{ position: 'absolute', backgroundColor: 'transparent' }, view.style],
  });
}

// NOT emitted, all [hand]: the `onPress` wrapper with `stopPropagation` goes to the adapter's
// event bridge, the legacy `Commands.*` path needs legacy UIManager commands in the engine,
// `decorateMap` is injected by `MapView`, and `static Animated` becomes a per-adapter wrapper
