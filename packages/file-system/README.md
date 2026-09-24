# @symbiote-native/file-system

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-file-system`](https://github.com/expo/expo/tree/main/packages/expo-file-system) usable
from **every** adapter — React, Vue, Svelte, Solid, and Angular.

**Both of upstream's surfaces are ported, matching upstream's own layout.** The default export is
the modern, shared-object API — `File`/`Directory`/`Paths` classes built on JSI shared objects
(`expo-modules-core`'s `SharedObject`), upstream's own default entry as of SDK 54. The legacy,
function-based API (read/write/copy/move/delete, directory listing, disk-space queries, resumable
download/upload, Android Storage Access Framework) is available at the `./legacy` subpath,
reachable in the real upstream package as `expo-file-system/legacy`. See
[Legacy API (`/legacy`)](#legacy-api-legacy) below.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --file-system
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --file-system
```

Either way: installs `@symbiote-native/file-system` and wires the native autolinking automatically — see
[`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/file-system
```

`expo-file-system` and `expo-modules-core` come along as regular dependencies, pinned to exact
versions — never install them yourself, and never add the `expo` meta-package to your project.

## Required one-time step: native autolinking wiring

Same one-time step as every other `expo-modules-core` package this project ships — see
[`@symbiote-native/local-auth`'s README](../local-auth/README.md#required-one-time-step-native-autolinking-wiring)
and the `symbiote-expo-native-module` project skill.

`native-link.json` carries no `Info.plist` keys or `<application>` attributes — upstream's own
config plugin only sets two OPT-IN keys (`LSSupportsOpeningDocumentsInPlace`,
`UIFileSharingEnabled`), which an app adds itself only if it wants its Documents directory exposed
to the Files app; nothing here needs either by default.

</details>

**Android runtime permissions are NOT added automatically, by the CLI or otherwise** — add
whichever of these your app actually needs to your own `AndroidManifest.xml`, the same opt-in
shape [`@symbiote-native/media-library`](../media-library) uses:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- only if reading/writing outside your app's own sandboxed directories -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

`Paths.document`/`Paths.cache` operations and `StorageAccessFramework` (which asks the user to pick
a directory at runtime, and never touches the two `EXTERNAL_STORAGE` permissions) both work without
any of these on modern Android — they matter only for direct legacy-path access outside the app
sandbox.

## Shape

```
src/next/     File.ts / Directory.ts / Paths.ts / network-tasks.ts (UploadTask/DownloadTask) /
              watcher.ts (FileSystemWatcher) / path-utilities.ts / streams.ts / types.ts —
              the default, shared-object surface. See "API" below.
src/core/     file-system.ts (every legacy function + DownloadResumable/UploadTask +
              StorageAccessFramework), native-module.ts, types.ts. See "Legacy API" below.
src/angular/  @symbiote-native/file-system/angular — export * from '../next'
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/next/`
— every class here carries no children/ref/render fields, so there is nothing to split per
framework. `./angular` stays a physical file/subpath since Angular ships through a separate
`ngc`/AOT build (`build-ngc/`). `./legacy` is one subpath shared by every adapter, for the same
reason — plain async functions have no framework-specific shape either.

## Use it

```ts
import { File, Directory, Paths } from '@symbiote-native/file-system';

const file = new File(Paths.document, 'notes.txt');
file.write('hello world');
const contents = file.text();

const dir = new Directory(Paths.document, 'photos');
dir.create();
const entries = dir.list();

const downloaded = await File.downloadFileAsync(
  'https://example.com/big-file.zip',
  Paths.cache,
  {
    onProgress: ({ bytesWritten, totalBytes }) =>
      console.log(bytesWritten / totalBytes),
  },
);
```

Identical import surface on every adapter — `@symbiote-native/file-system/react`, `/vue`,
`/svelte`, `/solid`, `/angular` all re-export the same classes.

## API

### `File`

```ts
new File(...uris: (string | File | Directory)[])
static downloadFileAsync(url, destination, options?): Promise<File>
static pickFileAsync(options?): Promise<IPickSingleFileResult | IPickMultipleFilesResult>
static createDownloadTask(url, destination, options?): DownloadTask

.uri / .exists / .size / .md5 / .type / .lastModified / .creationTime / .parentDirectory /
.extension / .name
.write(contents, options?) / .text() / .bytes() / .base64()          // + Sync variants
.create(options?) / .delete() / .copy(dest) / .move(dest)            // + Sync variants
.open(mode) -> IFileSystemHandle
.readableStream() / .writableStream() / .stream() / .arrayBuffer() / .json() / .formData()
.slice(start?, end?, contentType?): Blob
.upload(url, options?): Promise<IFileSystemUploadResult>
.createUploadTask(url, options?): UploadTask
.watch(callback, options?): IFileSystemWatchSubscription
```

### `Directory`

```ts
new Directory(...uris: (string | File | Directory)[])
static pickDirectoryAsync(initialUri?): Promise<Directory>

.uri / .exists / .size / .parentDirectory / .name
.create(options?) / .delete() / .copy(dest) / .move(dest)
.list(): (File | Directory)[]
.createFile(name, options?): File
.createDirectory(name, options?): Directory
.watch(callback, options?): IFileSystemWatchSubscription
```

### `Paths`

```ts
Paths.cache / Paths.document / Paths.bundle: Directory
Paths.appleSharedContainers: Record<string, Directory>              // ios only
Paths.totalDiskSpace / Paths.availableDiskSpace: number
Paths.info(...uris): IPathInfo
Paths.join / .relative / .isAbsolute / .normalize / .dirname / .basename / .extname / .parse
```

### `UploadTask` / `DownloadTask`

State machines over a network transfer, both cancellable via `AbortSignal`:

```ts
new UploadTask(file, url, options?)
.uploadAsync(): Promise<IFileSystemUploadResult>
.state: IFileSystemUploadTaskState                                  // idle/active/completed/cancelled/error

new DownloadTask(url, destination, options?)
.downloadAsync(): Promise<File>
.pause() / .resume()
.savable(): IFileSystemDownloadPauseState                            // resume after app restart
static fromSavable(savable): DownloadTask
.state: IFileSystemDownloadTaskState                                 // + paused
```

### Errors

No custom JS error-class hierarchy — every native exception surfaces as an ordinary thrown `Error`
or rejected `Promise`, same as every other native module wrapper in this repo.

| Trigger                                                                             | When                                                                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Constructing a `File`/`Directory` with an invalid/empty path                        | `validatePath()` throws synchronously in the constructor                                                   |
| Reading/writing through a stale or already-closed handle                            | `IFileSystemHandle` methods throw                                                                          |
| `pickFileAsync`/`pickDirectoryAsync` cancelled by the user                          | Rejects with an `AbortError` (old-API overload) or resolves `{ canceled: true }` (options-object overload) |
| `upload()`/`createUploadTask()`/`createDownloadTask()` aborted via `options.signal` | Rejects with an `AbortError`                                                                               |
| `.copy()`/`.move()` onto an existing destination without `overwrite: true`          | Native `Exception` — destination already exists                                                            |
| Any operation on a path outside the app sandbox without permission                  | Native `Exception` — permission/sandbox violation                                                          |

## Legacy API (`/legacy`)

Upstream's original function-based surface — plain async functions over `expo-modules-core`
instead of JSI shared objects. Same install, same autolinking step as above; the native module
behind it is a **separate** registration (`ExponentFileSystem`, vs. the modern API's
`FileSystem`) inside the same `expo-file-system` npm dependency — nothing extra to install.

```ts
import {
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  downloadAsync,
  createDownloadResumable,
} from '@symbiote-native/file-system/legacy';

const fileUri = `${documentDirectory}notes.txt`;
await writeAsStringAsync(fileUri, 'hello world');
const contents = await readAsStringAsync(fileUri);

const resumable = createDownloadResumable(
  'https://example.com/big-file.zip',
  `${documentDirectory}big-file.zip`,
  undefined,
  ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    console.log(totalBytesWritten / totalBytesExpectedToWrite);
  },
);
await resumable.downloadAsync();
```

### Legacy API reference

```ts
documentDirectory / cacheDirectory / bundleDirectory: string | null       // trailing-slash-normalized
getInfoAsync(fileUri, options?): Promise<IFileSystemFileInfo>
readAsStringAsync(fileUri, options?): Promise<string>
writeAsStringAsync(fileUri, contents, options?): Promise<void>
getContentUriAsync(fileUri): Promise<string>                              // android; echoes input on ios
deleteAsync(fileUri, options?): Promise<void>
moveAsync(options) / copyAsync(options): Promise<void>                    // { from, to }
makeDirectoryAsync(fileUri, options?): Promise<void>
readDirectoryAsync(fileUri): Promise<string[]>
getFreeDiskStorageAsync() / getTotalDiskCapacityAsync(): Promise<number>  // bytes
downloadAsync(uri, fileUri, options?): Promise<IFileSystemDownloadResult>
uploadAsync(url, fileUri, options?): Promise<IFileSystemUploadResult>
createDownloadResumable(uri, fileUri, options?, callback?, resumeData?): DownloadResumable
createUploadTask(url, fileUri, options?, callback?): UploadTask
StorageAccessFramework.{ getUriForDirectoryInRoot, requestDirectoryPermissionsAsync,
  readDirectoryAsync, makeDirectoryAsync, createFileAsync,
  writeAsStringAsync, readAsStringAsync, deleteAsync, moveAsync, copyAsync }  // android
FileSystemSessionType, FileSystemUploadType, FileSystemEncodingType        // runtime enums
```

`DownloadResumable` carries `cancelAsync`/`pauseAsync`/`resumeAsync`/`savable()`;
`UploadTask` carries `cancelAsync`/`uploadAsync`. Both report progress through the `callback`
passed at construction, driven by a native event subscription keyed on the task's own uuid.

Plus every `IFileSystem*` type, ported from upstream's `legacy/FileSystem.types.ts` with this
repo's `I`-prefix convention for exported types (`ts-js-best-practices`).

### Legacy notes

- **`StorageAccessFramework` is Android-only** — every function throws `UnavailabilityError` on iOS,
  matching upstream (there is no SAF equivalent on iOS; use the ordinary `document`/`cacheDirectory`
  functions there instead).
- **`getContentUriAsync` is Android-only** — on iOS it resolves to the input `fileUri` unchanged,
  matching upstream's own platform branch, rather than throwing.
- **Progress callbacks fire only while a task is subscribed** — `DownloadResumable`/`UploadTask`
  add their native event listener only for the duration of the in-flight call
  (`downloadAsync`/`uploadAsync`/`resumeAsync`), removing it as soon as the promise settles, exactly
  as upstream does.
