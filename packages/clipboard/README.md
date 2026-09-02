# @symbiote-native/clipboard

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-clipboard`](https://docs.expo.dev/versions/latest/sdk/clipboard/) — read/write clipboard
text, URLs, and images, plus a clipboard-change listener — usable from **every** adapter: React,
Vue, Svelte, Solid, and Angular, not just React. Unlike `@symbiote-native/sensors`, which is all
`DeviceSensor`-shaped classes plus one free-function module (`Pedometer`), clipboard is closer to
`@symbiote-native/local-auth`'s shape — mostly stateless async functions — plus **one**
listener-based subscription (`addClipboardListener`) that each adapter wraps in its own
mount/unmount lifecycle (`useClipboard`).

## Install

```bash
npm install @symbiote-native/clipboard
```

Depends on `expo-clipboard` and `expo-modules-core` directly (regular dependencies, pinned to an
exact version — never a caret range, since this package's `core/` is hand-ported against one
specific native API shape and a newer resolve could silently drift the two apart). Never install
`expo-clipboard` yourself, and never add the `expo` meta-package to this project — it bundles its
own Metro/Babel pipeline that conflicts with this project's own.

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-clipboard`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/sensors`, `@symbiote-native/local-auth`) with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics live in the `symbiote-expo-native-module` skill. Clipboard itself needs no
`Info.plist`/`AndroidManifest.xml` permission entry on either platform — reading/writing the
clipboard requires no platform permission string.

## Shape

```
src/core/               getStringAsync/setStringAsync/hasStringAsync, getUrlAsync/setUrlAsync/
                         hasUrlAsync (iOS only), getImageAsync/setImageAsync/hasImageAsync, and
                         addClipboardListener/removeClipboardListener. native-module.ts resolves
                         the ExpoClipboard native module via expo-modules-core's
                         requireNativeModule.
src/react/hooks/         @symbiote-native/clipboard/react   — useClipboard
src/vue/composables/     @symbiote-native/clipboard/vue     — useClipboard (same name)
src/svelte/runes/        @symbiote-native/clipboard/svelte  — useClipboard (same name)
src/solid/primitives/    @symbiote-native/clipboard/solid   — createClipboard (Solid says
                                                              create*, not use*)
src/angular/services/    @symbiote-native/clipboard/angular — ClipboardService
```

Every function except the listener is plain stateless async and re-exported as-is. The listener
subscription (`addClipboardListener`) lives once in `core`, framework-agnostic; each adapter's
`useClipboard` hook/composable/rune, Solid's `createClipboard`, and `ClipboardService.connect()`
are thin mount/unmount wrappers (a DI-scoped `effect()` for Angular, a body-level subscription plus
`onCleanup` for Solid) around that same subscription — the plumbing is written once and shared by
every adapter.

## Use it

```ts
import {
  getStringAsync,
  setStringAsync,
  addClipboardListener,
} from '@symbiote-native/clipboard';
```

`useClipboard()`'s event only carries the clipboard's changed content _types_
(`IClipboardEvent.contentTypes`), never the string itself — every adapter's demo screen treats a
change as a cue to re-fetch via `getStringAsync()`, not a value to render directly.

```tsx
// React
import { useEffect, useState } from 'react';
import { getStringAsync, setStringAsync } from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/react';

function ClipboardScreen() {
  const clipboardEvent = useClipboard(); // IClipboardEvent | null
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    getStringAsync().then(setText);
  }, [clipboardEvent]);

  const handleCopy = (input: string) =>
    setStringAsync(input).then(() => getStringAsync().then(setText));

  return <Text>{text ?? 'checking…'}</Text>;
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getStringAsync, setStringAsync } from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/vue';

const text = ref('checking…');
function refresh(): void {
  void getStringAsync().then(value => {
    text.value = value;
  });
}
onMounted(refresh);

const clipboardEvent = useClipboard(); // Ref<IClipboardEvent | null>
watch(clipboardEvent, event => {
  if (event) refresh();
});

function handleCopy(input: string): void {
  void setStringAsync(input).then(refresh);
}
</script>
<template>
  <Text>{{ text }}</Text>
</template>
```

```svelte
<!-- Svelte -->
<script lang="ts">
  import { getStringAsync, setStringAsync } from '@symbiote-native/clipboard';
  import { useClipboard } from '@symbiote-native/clipboard/svelte';

  let text = $state('checking…');
  function refresh(): void {
    void getStringAsync().then(value => (text = value));
  }

  const clipboard = useClipboard(); // { current: IClipboardEvent | null }

  $effect(() => {
    refresh();
  });
  $effect(() => {
    if (clipboard.current !== null) refresh();
  });

  function handleCopy(input: string): void {
    void setStringAsync(input).then(refresh);
  }
</script>

<Text>{text}</Text>
```

```tsx
// Solid
import { createEffect, createSignal } from 'solid-js';
import { getStringAsync, setStringAsync } from '@symbiote-native/clipboard';
import { createClipboard } from '@symbiote-native/clipboard/solid';

function ClipboardScreen() {
  const clipboardEvent = createClipboard(); // Accessor<IClipboardEvent | null>
  const [text, setText] = createSignal('checking…');

  function refresh(): void {
    getStringAsync().then(setText);
  }
  refresh();

  createEffect(() => {
    if (clipboardEvent() !== null) refresh();
  });

  const handleCopy = (input: string) =>
    setStringAsync(input).then(refresh);

  return <Text>{text()}</Text>;
}
```

```ts
// Angular
import { Component, Injector, effect, inject, signal } from '@angular/core';
import {
  ClipboardService,
  getStringAsync,
  setStringAsync,
} from '@symbiote-native/clipboard/angular';

@Component({/* ... */})
export class ClipboardScreen {
  private readonly injector = inject(Injector);
  private readonly clipboardEvent = inject(ClipboardService).connect(); // Signal<IClipboardEvent | null>
  readonly text = signal('checking…');

  constructor() {
    this.refresh();
    effect(
      () => {
        if (this.clipboardEvent() !== null) this.refresh();
      },
      { injector: this.injector },
    );
  }

  handleCopy(input: string): void {
    setStringAsync(input).then(() => this.refresh());
  }

  private refresh(): void {
    getStringAsync().then(value => this.text.set(value));
  }
}
```

These are trimmed from the real demo screens — `examples/expo-react/screens/ClipboardScreen.tsx`,
`examples/expo-vue-sfc/screens/ClipboardScreen.vue`, `examples/expo-vue-tsx/screens/ClipboardScreen.tsx`,
`examples/expo-svelte/screens/ClipboardScreen.svelte`, `examples/expo-solid/screens/ClipboardScreen.tsx`,
`examples/expo-angular/src/screens/ClipboardScreen.ts` — which additionally show `hasStringAsync()`
status badges and, iOS-only, the `getUrlAsync`/`setUrlAsync`/`hasUrlAsync` URL surface.

## API

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
// React
import { useClipboard } from '@symbiote-native/clipboard/react';
const clipboardEvent = useClipboard(); // IClipboardEvent | null

// Vue
import { useClipboard } from '@symbiote-native/clipboard/vue';
const clipboardEvent = useClipboard(); // Ref<IClipboardEvent | null>

// Svelte
import { useClipboard } from '@symbiote-native/clipboard/svelte';
const clipboard = useClipboard(); // clipboard.current: IClipboardEvent | null

// Solid
import { createClipboard } from '@symbiote-native/clipboard/solid';
const clipboardEvent = createClipboard(); // Accessor<IClipboardEvent | null>

// Angular
import { ClipboardService } from '@symbiote-native/clipboard/angular';
readonly clipboardEvent = inject(ClipboardService).connect(); // Signal<IClipboardEvent | null>
```

`ClipboardPasteButton` (upstream's native paste-button view component, iOS 16+) is **not**
ported — out of scope for this pass. If it's ever wrapped, it follows
`symbiote-third-party-native-view`, not this package's `expo-modules-core` recipe.

## Test it

Tests exercise the JS layer only, against a fake native module in place of the real
`requireNativeModule` resolution (`src/core/**/*.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`) — no Fabric/Descriptor angle at all,
since clipboard
is a pure async-function + one-listener surface, never a view. Native rendering itself is verified
on-device (see the parent [README](../../README.md) for the project's testing model).

Native autolinking wiring (Android's 3-layer registration, iOS Podfile/pod install) is done across
all six `examples/expo-*` canary apps. It isn't wired into the public non-Expo canaries
(`examples/react`, `examples/vue-sfc`, `examples/vue-tsx`, `examples/svelte`, `examples/solid`,
`examples/angular`) yet — those don't depend on any `expo-modules-core` package today.
