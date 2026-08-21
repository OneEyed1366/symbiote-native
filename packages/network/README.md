# @symbiote-native/network

Port of [`expo-network`](https://docs.expo.dev/versions/latest/sdk/network/) for
[SymbioteNative](../../README.md) — network connection state (type/connected/internet-reachable)
with a change listener, device IP address, and airplane-mode detection, reachable from every
adapter (React, Vue, Svelte, Solid, Angular), not just React.

Built the same way as [`@symbiote-native/battery`](../battery) and
[`@symbiote-native/local-auth`](../local-auth), an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism: why `expo-modules-core` is
depended on directly and never the `expo` meta-package, why the upstream JS is hand-ported into
`core/` rather than imported, and how autolinking picks up the native module).

## Install

```bash
npm install @symbiote-native/network
```

Depends on `expo-network` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions — never a caret range, since this package's `core/` is hand-ported against one specific
native API shape and a newer resolve could silently drift the two apart). Never install
`expo-network` yourself, and never add the `expo` package to this project — it bundles its own
Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-network`'s native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every other `expo-modules-core`
package (`@symbiote-native/battery`, `@symbiote-native/sensors`, `@symbiote-native/local-auth`)
with zero further changes:

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

No platform permission string is needed for network's surface — connection state, IP address, and
airplane-mode detection all read system state with no runtime permission prompt on either
platform.

## Shape

```
src/core/               network.ts — get*Async functions + addNetworkStateListener subscription.
                        native-module.ts resolves the native module through expo-modules-core's
                        requireNativeModule. types.ts — NetworkStateType enum, NetworkState,
                        NetworkStateEvent, hand-ported from Network.types.ts.
src/react/hooks/        @symbiote-native/network/react   — useNetworkState
src/vue/composables/    @symbiote-native/network/vue     — useNetworkState (same name)
src/svelte/runes/       @symbiote-native/network/svelte  — useNetworkState (same name)
src/solid/primitives/   @symbiote-native/network/solid   — createNetworkState (returns an
                        Accessor; Solid reserves `use*` for consuming existing state)
src/angular/services/   @symbiote-native/network/angular — NetworkStateService (`.connect()`
                        returns a Signal)
```

Each adapter's hook/composable/rune/primitive/service is a thin lifecycle wrapper (seed from the
one-shot `getNetworkStateAsync()` call, subscribe to `addNetworkStateListener`, unsubscribe on
unmount) over the same `core` functions — the subscription logic is written once and shared by all
of them.

## Use it

```tsx
// React — examples/expo-react/screens/NetworkScreen.tsx
import { useEffect, useState } from 'react';
import {
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
import { useNetworkState } from '@symbiote-native/network/react';

function NetworkScreen() {
  const networkState = useNetworkState(); // { type, isConnected, isInternetReachable }
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isAirplaneMode, setIsAirplaneMode] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        setIpAddress(ip);
        setIsAirplaneMode(airplaneMode);
      },
    );
  }, [networkState]);

  return (
    <>
      <Text>
        {networkState.isConnected
          ? `Connected via ${networkState.type}`
          : 'Offline'}
      </Text>
      <Text>{ipAddress ?? 'checking…'}</Text>
      <Text>{isAirplaneMode ? 'Airplane mode: On' : 'Airplane mode: Off'}</Text>
    </>
  );
}
```

```vue
<!-- Vue — examples/expo-vue-sfc/screens/NetworkScreen.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Text } from '@symbiote-native/vue';
import {
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
import { useNetworkState } from '@symbiote-native/network/vue';

const networkState = useNetworkState(); // Ref<NetworkState>
const ipAddress = ref<string | null>(null);
const isAirplaneMode = ref<boolean | null>(null);

watch(
  networkState,
  () => {
    void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        ipAddress.value = ip;
        isAirplaneMode.value = airplaneMode;
      },
    );
  },
  { immediate: true },
);
</script>
<template>
  <Text>{{
    networkState.isConnected ? `Connected via ${networkState.type}` : 'Offline'
  }}</Text>
  <Text>{{ ipAddress ?? 'checking…' }}</Text>
</template>
```

```ts
// Angular — examples/expo-angular/src/screens/NetworkScreen.ts
import { Component, effect, inject, signal } from '@angular/core';
import { Text } from '@symbiote-native/angular';
import {
  NetworkStateService,
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network/angular';

@Component({
  standalone: true,
  imports: [Text],
  template: `<Text>{{ ipAddress() }}</Text>`,
})
export class NetworkScreen {
  readonly networkState = inject(NetworkStateService).connect(); // Signal<NetworkState>
  readonly ipAddress = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.networkState();
      Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
        ([ip]) => {
          this.ipAddress.set(ip);
        },
      );
    });
  }
}
```

```tsx
// Solid — the accessor is CALLED; a Solid component body runs once, so a snapshot would freeze.
import { createSignal, onMount } from 'solid-js';
import { Text } from '@symbiote-native/solid';
import {
  getIpAddressAsync,
  isAirplaneModeEnabledAsync,
} from '@symbiote-native/network';
import { createNetworkState } from '@symbiote-native/network/solid';

function NetworkScreen() {
  const networkState = createNetworkState(); // Accessor<NetworkState>
  const [ipAddress, setIpAddress] = createSignal<string | null>(null);
  const [isAirplaneMode, setIsAirplaneMode] = createSignal<boolean | null>(
    null,
  );

  onMount(() => {
    void Promise.all([getIpAddressAsync(), isAirplaneModeEnabledAsync()]).then(
      ([ip, airplaneMode]) => {
        setIpAddress(ip);
        setIsAirplaneMode(airplaneMode);
      },
    );
  });

  return (
    <>
      <Text>
        {networkState().isConnected
          ? `Connected via ${networkState().type}`
          : 'Offline'}
      </Text>
      <Text>{ipAddress() ?? 'checking…'}</Text>
      <Text>
        {isAirplaneMode() ? 'Airplane mode: On' : 'Airplane mode: Off'}
      </Text>
    </>
  );
}
```

Each of the demo screens above also re-fetches the IP address and airplane-mode card
whenever the live network state changes (toggling Wi-Fi/airplane mode on the device updates both
cards together) — see the linked files for the full version, including the connection-type label
switch and the layout around it.

## API

A mix of stateless async functions and one listener-based subscription
(`addNetworkStateListener`), with its own adapter-level lifecycle hook.

```ts
getNetworkStateAsync(): Promise<NetworkState>          // { type, isConnected, isInternetReachable }
getIpAddressAsync(): Promise<string>                    // device's IPv4 address, "0.0.0.0" if unavailable
isAirplaneModeEnabledAsync(): Promise<boolean>          // Android only
addNetworkStateListener(listener): EventSubscription     // fires whenever the network state changes
```

Plus `NetworkStateType` (enum: `NONE`/`UNKNOWN`/`CELLULAR`/`WIFI`/`BLUETOOTH`/`ETHERNET`/`WIMAX`/
`VPN`/`OTHER`), `NetworkState`, `NetworkStateEvent` — ported from upstream's `Network.types.ts`.

```ts
import {
  getNetworkStateAsync,
  addNetworkStateListener,
} from '@symbiote-native/network';

// framework-scoped entry points re-export the same free functions, plus a lifecycle
// hook/composable/service:
import { useNetworkState } from '@symbiote-native/network/react';
import { useNetworkState } from '@symbiote-native/network/vue';
import { useNetworkState } from '@symbiote-native/network/svelte';
import { createNetworkState } from '@symbiote-native/network/solid';
import { NetworkStateService } from '@symbiote-native/network/angular';
```

`useNetworkState` (Solid: `createNetworkState`) seeds its initial value from a one-shot
`getNetworkStateAsync()` call, then subscribes to `addNetworkStateListener` for updates, and
unsubscribes on unmount — mirroring upstream's own `useNetworkState`. The Solid primitive returns
an `Accessor<NetworkState>` and subscribes from its body rather than an effect, so nothing can slip
between the seed and the subscription.

## Test it

No Fabric/Descriptor angle at all — network is a pure async-function + `EventEmitter` listener
surface, never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/network.test.ts`,
`src/{react,vue,angular}/**/*.test.{ts,tsx}`, `vitest`), the same pattern
`@symbiote-native/battery`/`@symbiote-native/sensors`/`@symbiote-native/local-auth` use — no
`installFabric()`, no ViewConfig. Native rendering itself is verified on-device — see the parent
[README](../../README.md).

The Android/iOS native wiring is done across all four `examples/expo-*` canary apps
(`examples/expo-react`, `examples/expo-vue-sfc`, `examples/expo-vue-tsx`, `examples/expo-angular`);
this package isn't yet in the public, non-Expo `examples/react` canary.
