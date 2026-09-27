# @symbiote-native/media-library

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-media-library`](https://github.com/expo/expo/tree/main/packages/expo-media-library) usable
from **every** adapter — React, Vue, Svelte, Solid, and Angular.

**Both of upstream's surfaces are ported, matching upstream's own layout.** The default export is
the modern, shared-object API — `Query`/`Asset`/`Album` classes built on JSI shared objects
(`expo-modules-core`'s `SharedObject`), upstream's own default entry as of SDK 57. The legacy,
function-based API is available at the `./legacy` subpath, reachable in the real upstream package
as `expo-media-library/legacy`. See [Legacy API (`/legacy`)](#legacy-api-legacy) below.

Reads, saves, and organizes the device's photo/video library — assets, albums, permissions
(including the granular Android 13+ and limited-access iOS/Android 14+ pickers), and
library-change events.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --media-library
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --media-library
```

Either way: installs `@symbiote-native/media-library` and wires the native autolinking
automatically — see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/media-library
```

`expo-media-library` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install them yourself, and never add the `expo` meta-package to your project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill.

`native-link.json` declares two iOS `Info.plist` usage-description keys
(`NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) with generic default
text — override either by setting the same key yourself before or after install
(`@symbiote-native/expo-modules-link`'s patcher is additive-only). It also sets
`android:requestLegacyExternalStorage="true"` on your app's `<application>` tag — required by
upstream's own config plugin for scoped-storage compatibility on Android 10+.

</details>

**Android runtime permissions are NOT added automatically, by the CLI or otherwise** — add
whichever of these your app actually needs to your own `AndroidManifest.xml`, the same opt-in
shape [`@symbiote-native/location`](../location) uses for background location:

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<!-- only if reading GPS location out of an asset's EXIF data -->
<uses-permission android:name="android.permission.ACCESS_MEDIA_LOCATION" />
```

`READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`/`READ_MEDIA_AUDIO` are the granular Android 13+
permissions — pass the matching subset as `requestPermissionsAsync(false, [...])`'s second
argument; omitting one here means Android silently refuses that grant regardless of what the app
asks for at runtime.

## Shape

```
src/next/     query.ts / asset.ts / album.ts (Query/Asset/Album shared-object classes) /
              native-module.ts / types.ts — the default, shared-object surface. See "API" below.
src/core/     media-library.ts (every legacy function + the three useXPermissions hooks),
              native-module.ts, types.ts. See "Legacy API" below.
src/angular/  @symbiote-native/media-library/angular — export * from '../next'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/next/`
— `Query`/`Asset`/`Album` carry no children/ref/render fields, so there is nothing to split per
framework. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`). `./legacy` is one subpath shared by every adapter, for the same
reason — plain async functions have no framework-specific shape either.

## Use it

```ts
import {
  Query,
  Asset,
  Album,
  AssetField,
  requestPermissionsAsync,
} from '@symbiote-native/media-library';

const { granted } = await requestPermissionsAsync(false, ['photo']);
if (granted) {
  const asset = await Asset.create(photoUri);
  const album = await Album.create('My Album', [asset]);

  const recentPhotos = await new Query()
    .eq(AssetField.MEDIA_TYPE, 'image' as never)
    .orderBy(AssetField.CREATION_TIME)
    .limit(20)
    .exe();
}
```

Identical import surface on every adapter — `@symbiote-native/media-library/react`, `/vue`,
`/svelte`, `/solid`, `/angular` all re-export the same classes.

## API

### `Query`

Builder pattern — every filter/sort method returns the same instance for chaining.

```ts
new Query()
.eq(field, value) / .within(field, value[]) / .gt(field, value) / .gte(field, value) /
.lt(field, value) / .lte(field, value)                              // AssetField-keyed filters
.limit(n) / .offset(n)
.orderBy(sortDescriptor | AssetField)
.album(album: Album)
.exe(): Promise<Asset[]>
.exeForMetadata(): Promise<AssetMetadata[]>                          // lightweight fields only
```

### `Asset`

```ts
new Asset(id: string)
static create(filePath, album?): Promise<Asset>
static delete(assets: Asset[]): Promise<void>

.id
.getCreationTime() / .getModificationTime(): Promise<number | null>
.getDuration(): Promise<number | null>                              // audio/video only
.getFilename() / .getUri(): Promise<string>
.getWidth() / .getHeight(): Promise<number>
.getMediaType(): Promise<MediaType>
.getShape(): Promise<Shape | null>
.getInfo(): Promise<AssetInfo>
.getAlbums(): Promise<Album[]>
.getLocation(): Promise<Location | null>                            // android needs ACCESS_MEDIA_LOCATION
.getExif(): Promise<Record<string, unknown>>
.getFavorite(): Promise<boolean> / .setFavorite(isFavorite): Promise<void>
.delete(): Promise<void>
.getMediaSubtypes(): Promise<MediaSubtype[]>                        // ios only
.getLivePhotoVideoUri(): Promise<string | null>                     // ios only
.getIsInCloud(): Promise<boolean>                                   // ios only
.getOrientation(): Promise<number | null>                           // ios only
```

### `Album`

```ts
new Album(id: string)
static create(name, assetsRefs, moveAssets?): Promise<Album>
static delete(albums: Album[], deleteAssets?): Promise<void>
static get(title): Promise<Album | null>
static getAll(): Promise<Album[]>

.id
.getAssets(): Promise<Asset[]>
.getTitle(): Promise<string>
.add(assets: Asset | Asset[]): Promise<void>
.removeAssets(assets: Asset[]): Promise<void>                       // ios only
.delete(): Promise<void>
```

### Permissions and change events

```ts
requestPermissionsAsync(writeOnly?, granularPermissions?) /
getPermissionsAsync(writeOnly?, granularPermissions?): Promise<PermissionResponse>
usePermissions(options?)
presentPermissionsPicker(mediaTypes?): Promise<void>                // android 14+ / ios
addListener(listener) / removeAllListeners(): void
```

Plus `AssetField`, `MediaType`, `MediaSubtype` runtime enums and every `I*` type, ported from
upstream's default-entry types with this repo's `I`-prefix convention for exported types
(`ts-js-best-practices`).

### Errors

No custom JS error-class hierarchy — every native exception surfaces as an ordinary thrown `Error`
or rejected `Promise`, same as every other native module wrapper in this repo.

| Trigger                                                                                               | When                                                                                               |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Calling an `Asset`/`Album` method on an ID that no longer exists on the device                        | Native `Exception` — "could not be found"                                                          |
| `Asset.getMediaSubtypes()`/`.getLivePhotoVideoUri()`/`.getIsInCloud()`/`.getOrientation()` on Android | `UnavailabilityError` — thrown synchronously, iOS only                                             |
| `Album.removeAssets()` on Android                                                                     | Native `Exception` — an Android asset belongs to one album; delete it or add it to another instead |
| `getLocation()` on Android without `ACCESS_MEDIA_LOCATION`                                            | Rejects — needs that runtime permission                                                            |

## Legacy API (`/legacy`)

Upstream's original function-based surface — plain async functions over `expo-modules-core`
instead of JSI shared objects.

```ts
import {
  requestPermissionsAsync,
  createAssetAsync,
  getAssetsAsync,
  addListener,
} from '@symbiote-native/media-library/legacy';

const { granted } = await requestPermissionsAsync(false, ['photo']);
if (granted) {
  const asset = await createAssetAsync(photoUri);
  const page = await getAssetsAsync({ first: 20, mediaType: 'photo' });

  const subscription = addListener(event => {
    console.log('library changed', event.hasIncrementalChanges);
  });
  // later: subscription.remove();
}
```

### Legacy API reference

```ts
isAvailableAsync(): Promise<boolean>
requestPermissionsAsync(writeOnly?, granularPermissions?) / getPermissionsAsync(writeOnly?, granularPermissions?): Promise<IMediaLibraryPermissionResponse>
usePermissions(options?)
presentPermissionsPickerAsync(mediaTypes?): Promise<void>                                   // android 14+ / ios
createAssetAsync(localUri, album?): Promise<IMediaLibraryAsset>
saveToLibraryAsync(localUri): Promise<void>
addAssetsToAlbumAsync(assets, album, copy?): Promise<boolean>
removeAssetsFromAlbumAsync(assets, album): Promise<boolean>
deleteAssetsAsync(assets): Promise<boolean>
getAssetInfoAsync(asset, options?): Promise<IMediaLibraryAssetInfo>
getAssetContentUriAsync(asset): Promise<string>                                             // android
getAlbumsAsync(options?) / getAlbumAsync(title): Promise<IMediaLibraryAlbum[] | IMediaLibraryAlbum>
createAlbumAsync(albumName, asset?, copyAsset?, initialAssetLocalUri?): Promise<IMediaLibraryAlbum>
deleteAlbumsAsync(albums, deleteAssets?): Promise<boolean>
getAssetsAsync(options?): Promise<IMediaLibraryPagedInfo<IMediaLibraryAsset>>
addListener(listener) / removeAllListeners(): void
getMomentsAsync(): Promise<IMediaLibraryAlbum[]>                                            // ios
migrateAlbumIfNeededAsync(album) / albumNeedsMigrationAsync(album): Promise<void | boolean>  // android R+
setAssetFavoriteAsync(asset, isFavorite): Promise<boolean>                                  // ios
MediaType, SortBy                                                                           // runtime constants, from native
```

Plus every `IMediaLibrary*` type, ported from upstream's `legacy/MediaLibrary.ts` with this
repo's `I`-prefix convention for exported types (`ts-js-best-practices`).

### Legacy notes

- **`sortBy`'s single-tuple form must be double-nested — an upstream quirk, ported verbatim.**
  `getAssetsAsync({ sortBy: [['creationTime', true]] })` sorts by one key ascending; the
  unnested `sortBy: ['creationTime', true]` is read as two independent (and here, invalid) sort
  keys, because upstream's own `arrayize()` helper passes any array through unchanged rather than
  distinguishing "one tuple" from "several keys". See `media-library.test.ts` and the
  `UPSTREAM-BUG` comment on `getAssetsAsync`.
- **`getAssetContentUriAsync` is Android-only** — a plain `content://` URI, still useful even
  though the modern `Asset`/`Query` API above ports the shared-object surface it used to bridge to.
- **`getMomentsAsync` and `setAssetFavoriteAsync` are iOS-only**; `getAssetContentUriAsync`,
  `migrateAlbumIfNeededAsync`, and `albumNeedsMigrationAsync` are Android-only or Android-R+-only.
  Each throws (or, for the migration pair, resolves a safe default) on the wrong platform, matching
  upstream.
- **No Expo Go warning.** Upstream logs a one-time console warning about reduced Expo Go
  permissions; this project never runs under Expo Go (`<examples_vs_dot_examples>` in root
  CLAUDE.md), so the check and the warning are dropped rather than ported.

## Test it

No Fabric/Descriptor angle at all — every function here is a pure async-function surface plus one
native change-event listener, never a view or per-instance state. Tests inject a fake native-module
object in place of the real `requireNativeModule` resolution and fire the wired listener directly
(`src/core/media-library.test.ts`, `src/next/next.test.ts`) — no `installFabric()`, no ViewConfig.
