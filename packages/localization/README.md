# @symbiote-native/localization

Port of [`expo-localization`](https://docs.expo.dev/versions/latest/sdk/localization/) for
[SymbioteNative](../../README.md) — the device's locale list and preferred calendar settings,
reachable from every adapter (React, Vue, Svelte, Solid, Angular), not just React.

Built the same way as [`@symbiote-native/battery`](../battery) and
[`@symbiote-native/device`](../device), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/localization
```

Depends on `expo-localization` and `expo-modules-core` directly (regular dependencies, pinned to
exact versions — never a caret range, since this package's `core/` is hand-ported against one
specific native API shape and a newer resolve could silently drift the two apart). Never install
`expo-localization` yourself, and never add the `expo` package to this project — it bundles its
own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-localization`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/battery`, `@symbiote-native/device`, ...) with zero further changes:

| Platform | Touches                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | `ios/Podfile` — add `use_expo_modules!`                                                                                                             |
| iOS      | `AppDelegate.swift` — Expo's runtime-bootstrap hook                                                                                                 |
| Android  | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects                                                               |
| Android  | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list — live in the `symbiote-expo-native-module` skill. Reference
implementation: `examples/expo-react/ios/Podfile` and
`examples/expo-react/android/app/src/main/java/com/canaryexpo/MainApplication.kt`.

No platform permission string is needed — locale and calendar settings are read-only system
state with no runtime permission prompt on either platform.

## Shape

```
src/core/               types.ts — Locale, Weekday, CalendarIdentifier, Calendar, hand-ported
                        verbatim from Localization.types.ts. native-module.ts resolves the
                        native module through expo-modules-core's requireNativeModule and
                        exposes addLocaleListener/addCalendarListener. localization.ts —
                        getLocales/getCalendars, synchronous getters delegating straight to the
                        native module.
src/react/hooks/        @symbiote-native/localization/react   — useLocales, useCalendars
src/vue/composables/    @symbiote-native/localization/vue     — same two names, Vue lifecycle
src/svelte/runes/       @symbiote-native/localization/svelte  — same two names, read as `.current`
src/solid/primitives/   @symbiote-native/localization/solid   — createLocales, createCalendars
                        (each returns an Accessor)
src/angular/services/   @symbiote-native/localization/angular — LocalesService, CalendarsService
                        (`.connect()` returns a Signal)
```

Two independent getters, each with its own native change listener and its own reactive hook per
adapter — mirroring `@symbiote-native/battery`'s shape of shipping several distinct hooks in one
package, not one combined hook. Solid's naming differs on purpose: `create*`, not `use*`, which
Solid reserves for consuming something that already exists. Each hook/composable/rune/primitive/
service seeds its return value from the
matching synchronous `get*()` call (no initial "loading" state needed — the native call is
sync, not async) and recomputes it whenever the matching listener fires.

## Use it

```tsx
// React — examples/expo-react/screens/LocalizationScreen.tsx
import { useLocales, useCalendars } from '@symbiote-native/localization/react';

function LocalizationScreen() {
  const locales = useLocales(); // Locale[], guaranteed at least 1 element
  const calendars = useCalendars(); // Calendar[], guaranteed at least 1 element

  return (
    <>
      <Text>{locales[0].languageTag}</Text>
      <Text>{calendars[0].timeZone}</Text>
    </>
  );
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/LocalizationScreen.vue -->
<script setup lang="ts">
import { useLocales, useCalendars } from '@symbiote-native/localization/vue';

const locales = useLocales(); // Ref<Locale[]>
const calendars = useCalendars(); // Ref<Calendar[]>
</script>
<template>
  <Text>{{ locales[0].languageTag }}</Text>
  <Text>{{ calendars[0].timeZone }}</Text>
</template>
```

```tsx
// Solid — an accessor per getter; call it to read, so a component body that runs once still
// re-renders the leaf that reads it.
import {
  createLocales,
  createCalendars,
} from '@symbiote-native/localization/solid';

function LocalizationScreen() {
  const locales = createLocales(); // Accessor<Locale[]>
  const calendars = createCalendars(); // Accessor<Calendar[]>

  return (
    <>
      <Text>{locales()[0].languageTag}</Text>
      <Text>{calendars()[0].timeZone}</Text>
    </>
  );
}
```

```ts
// Angular — examples/expo-angular/src/screens/LocalizationScreen.ts
import { Component, inject } from '@angular/core';
import {
  LocalesService,
  CalendarsService,
} from '@symbiote-native/localization/angular';

@Component({/* ... */})
export class LocalizationScreen {
  readonly locales = inject(LocalesService).connect(); // Signal<Locale[]>
  readonly calendars = inject(CalendarsService).connect(); // Signal<Calendar[]>
}
```

## API

Two independent synchronous getters (`getLocales`, `getCalendars`), each with its own
listener-based subscription (`addLocaleListener`/`addCalendarListener`) and its own adapter-level
lifecycle hook — one hook/composable/service per getter, matching upstream's own `useLocales`/
`useCalendars` being two separate hooks, not one combined hook.

```ts
getLocales(): Locale[]                                        // user's locales, in device-settings order
getCalendars(): Calendar[]                                    // user's preferred calendars
addLocaleListener(listener): EventSubscription                 // fires when locale settings change
addCalendarListener(listener): EventSubscription                // fires when calendar settings change
```

Plus `Locale`, `Weekday` (enum), `CalendarIdentifier` (enum), `Calendar` — ported from upstream's
`Localization.types.ts`.

```ts
import { getLocales, getCalendars } from '@symbiote-native/localization';

// framework-scoped entry points re-export the same free functions, plus a lifecycle
// hook/composable/service per getter:
import { useLocales, useCalendars } from '@symbiote-native/localization/react';
import { useLocales, useCalendars } from '@symbiote-native/localization/vue';
import { useLocales, useCalendars } from '@symbiote-native/localization/svelte';
import {
  createLocales,
  createCalendars,
} from '@symbiote-native/localization/solid';
import {
  LocalesService,
  CalendarsService,
} from '@symbiote-native/localization/angular';
```

Each hook/composable/service seeds its initial value from the matching synchronous `get*()`
call, then subscribes to the matching listener for updates, and unsubscribes on unmount —
mirroring upstream's own `useLocales`/`useCalendars`.

## Test it

No Fabric/Descriptor angle at all — localization is a pure synchronous-function + `EventEmitter`
listener surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/localization.test.ts`,
`src/{react,vue,svelte,solid,angular}/**/*.test.{ts,tsx}`, `vitest`), the same pattern
`@symbiote-native/battery` and `@symbiote-native/device` use — no `installFabric()`, no
ViewConfig for the core test; the adapter hook/composable/service tests do use `installFabric()`
purely to mount a host component, same as every other sibling package. Native rendering itself is
verified on-device — see the parent [README](../../README.md).
