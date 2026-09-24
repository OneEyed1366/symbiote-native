// Ported from expo-asset/src/AssetUris.ts (sdk-57).

// Read via globalThis, matching packages/background-task's own __DEV__ convention (no ambient
// declare — react-native is a peer, never imported here).
type IDevGlobal = { __DEV__?: boolean };
function isDevBuild(): boolean {
  return Boolean((globalThis as IDevGlobal).__DEV__);
}

function getBasename(pathname: string): string {
  return pathname.substring(pathname.lastIndexOf('/') + 1);
}

export function getFilename(url: string): string {
  const { pathname, searchParams } = new URL(url, 'https://e');

  if (isDevBuild() && searchParams.has('unstable_path')) {
    const encodedFilePath = decodeURIComponent(
      searchParams.get('unstable_path')!,
    );
    return getBasename(encodedFilePath);
  }

  return getBasename(pathname);
}

export function getFileExtension(url: string): string {
  const filename = getFilename(url);
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(dotIndex) : '';
}

// Rebuilds the URL from parts rather than mutating `protocol`/`pathname` in place: react-native's
// own global.d.ts types those fields readonly (its URL polyfill's actual shape), conflicting with
// @types/node's writable declaration wherever both are ambient — same net result either way.
export function getManifestBaseUrl(manifestUrl: string): string {
  const urlObject = new URL(manifestUrl);

  const protocol =
    urlObject.protocol === 'exp:'
      ? 'http:'
      : urlObject.protocol === 'exps:'
        ? 'https:'
        : urlObject.protocol;
  const directory = urlObject.pathname.substring(
    0,
    urlObject.pathname.lastIndexOf('/') + 1,
  );

  return `${protocol}//${urlObject.host}${directory}`;
}
