# @symbiote-native/clipboard

Port of [`expo-clipboard`](https://docs.expo.dev/versions/latest/sdk/clipboard/) for
[SymbioteNative](../../README.md) — read/write clipboard text, URLs, and images, plus a
clipboard-change listener, reachable from every adapter (React, Vue, Angular), not just React.

Built the same way as [`@symbiote-native/sensors`](../sensors) and
[`@symbiote-native/local-auth`](../local-auth), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## API

Mostly stateless async functions plus **one** listener-based subscription
(`addClipboardListener`) — a mix, like `@symbiote-native/local-auth`'s free functions on one
side and `@symbiote-native/sensors`' `Accelerometer.addListener` on the other. The listener
lives in `core` as a plain framework-agnostic function; each adapter wraps it in its own
mount/unmount lifecycle (`useClipboard`) rather than duplicating the subscription plumbing.

```ts
getStringAsync(options?: IGetStringOptions): Promise<string>
setStringAsync(text: string, options?: ISetStringOptions): Promise<boolean>
hasStringAsync(): Promise<boolean>
getUrlAsync(): Promise<string | null> // iOS only
setUrlAsync(url: string): Promise<void> // iOS only
hasUrlAsync(): Promise<boolean> // iOS only
getImageAsync(options: IGetImageOptions): Promise<IClipboardImage | null>
setImageAsync(base64Image: string): Promise<void>
hasImageAsync(): Promise<boolean>
addClipboardListener(listener: (event: IClipboardEvent) => void): EventSubscription
removeClipboardListener(subscription: EventSubscription) // deprecated, use subscription.remove()
```

Plus `ContentType`, `StringFormat`, `IGetStringOptions`, `ISetStringOptions`, `IGetImageOptions`,
`IClipboardImage`, `IClipboardEvent` — ported from upstream's `Clipboard.types.ts`, renamed with
this repo's `I`-prefix convention for exported types (`ts-js-best-practices`); `ContentType` and
`StringFormat` stay unprefixed enums, matching `AuthenticationType`/`SecurityLevel` in
`@symbiote-native/local-auth`.

```ts
import { getStringAsync, setStringAsync, addClipboardListener } from '@symbiote-native/clipboard';

// React
import { useClipboard } from '@symbiote-native/clipboard/react';
const clipboardEvent = useClipboard(); // IClipboardEvent | null

// Vue
import { useClipboard } from '@symbiote-native/clipboard/vue';
const clipboardEvent = useClipboard(); // Ref<IClipboardEvent | null>

// Angular
import { ClipboardService } from '@symbiote-native/clipboard/angular';
readonly clipboardEvent = inject(ClipboardService).connect(); // Signal<IClipboardEvent | null>
```

`ClipboardPasteButton` (upstream's native paste-button view component, iOS 16+) is **not**
ported — out of scope for this pass, same open question the earlier skeleton README flagged. If
it's ever wrapped, it follows `symbiote-third-party-native-view`, not this package's
`expo-modules-core` recipe.

## Not yet done

- **Native example wiring.** `examples/react`'s `expo-modules-core` bring-up (Podfile
  monkeypatch + Android `settings.gradle` fallback, done for `@symbiote-native/sensors`)
  auto-discovers any resolvable expo-modules-core package — adding this package needs only:
  (1) `expo-clipboard` added to the Android `wantedExpoModules` allow-list in
  `examples/react/android/settings.gradle`, (2) no `Info.plist`/`AndroidManifest.xml` entries
  are needed (clipboard access requires no platform permission). Wait on a real published/canary
  build of this package first — `examples/react` resolves `@symbiote-native/*` by pinned
  version, not `workspace:*`.
- Tests exercise the JS layer only (fake native module, `vitest`) — no on-device/simulator smoke
  test yet.
