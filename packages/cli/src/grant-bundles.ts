import {
  collectManifests,
  patchAndroidManifestPermissions,
  patchAndroidManifestServices,
  type ISymbioteExpoLinkOptionalBundle,
} from '@symbiote-native/expo-modules-link';
import type { IExpoPackageLayer } from './expo-package-layers.js';

export type IDiscoveredBundle = {
  readonly packageName: string;
  readonly bundle: ISymbioteExpoLinkOptionalBundle;
};

// `add`/`new`'s pre-install path to the same shape `discoverOptionalBundles` produces from
// node_modules — the layer registry already carries the bundle data (see its own comment), so
// this is just the flatten, not a second discovery mechanism.
export function discoveredBundlesFromLayers(
  layers: readonly IExpoPackageLayer[],
): IDiscoveredBundle[] {
  return layers.flatMap(layer =>
    (layer.optionalManifestBundles ?? []).map(bundle => ({
      packageName: layer.symbiotePackage,
      bundle,
    })),
  );
}

// Discovery is scoped to what's actually installed — collectManifests already knows how to find
// every native-link.json under node_modules (scoped packages, malformed-JSON skip, sorting), so
// this only adds the one filter: pull out `android.optionalManifestBundles` where present.
export function discoverOptionalBundles(appRoot: string): IDiscoveredBundle[] {
  const discovered: IDiscoveredBundle[] = [];
  for (const entry of collectManifests(appRoot)) {
    const bundles = entry.manifest.android?.optionalManifestBundles;
    if (!bundles) continue;
    for (const bundle of bundles) {
      discovered.push({ packageName: entry.packageName, bundle });
    }
  }
  return discovered;
}

// No new manifest-editing code here on purpose: a granted bundle's permissions/services are
// patched through the exact same, already-idempotent functions the postinstall aggregator itself
// uses — `grant` only supplies WHICH data to feed them (one synthetic entry, the chosen bundle),
// never how to write XML.
export function applyBundle(
  appRoot: string,
  bundle: ISymbioteExpoLinkOptionalBundle,
): void {
  const entries = [
    {
      packageName: `grant:${bundle.id}`,
      manifest: {
        android: {
          manifestPermissions: bundle.manifestPermissions,
          manifestServices: bundle.manifestServices,
        },
      },
    },
  ];
  patchAndroidManifestPermissions(appRoot, entries);
  patchAndroidManifestServices(appRoot, entries);
}

function packageShortName(packageName: string): string {
  const slashIndex = packageName.lastIndexOf('/');
  return slashIndex === -1 ? packageName : packageName.slice(slashIndex + 1);
}

// `grant location` filters by the package's short name (how a developer actually types it,
// matching the `add --<layer>` flag convention), not the scoped specifier.
export function filterBundlesForLayer(
  discovered: readonly IDiscoveredBundle[],
  layer: string | undefined,
): IDiscoveredBundle[] {
  if (layer === undefined) return [...discovered];
  return discovered.filter(
    entry => packageShortName(entry.packageName) === layer,
  );
}
