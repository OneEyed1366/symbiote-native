# @symbiote-native/angular

The **Angular adapter** for [SymbioteNative](../../README.md) — render real native iOS/Android views
from Angular, on the _same_ untouched core as React, Vue, Svelte, and Solid, with React Native's own renderer
never in the path. It is a `Renderer2`/`RendererFactory2` whose calls map onto the engine's
four-call mutation API; `@symbiote-native/engine` does the clone-on-write commit into Fabric.

Angular is the **second proof the core is genuinely framework-agnostic**: a third
framework, with its own change-detection model and AOT compilation pipeline, driving the
already-validated engine with zero changes to it.

<div align="center">

![Angular driving real native iOS views through SymbioteNative](../../assets/angular-demo.gif)

</div>

> New to SymbioteNative? The [root README](../../README.md) has the architecture.

---

## Install

```bash
npx @symbiote-native/cli new my-app --framework angular
```

One command, nothing to wire by hand: this adapter needs the most build wiring of the five (the
AOT pipeline, `ngc --watch` alongside Metro, the static-block Babel plugin below) — the generator
sets up all of it, plus `@symbiote-native/angular`/`react-native`/`@angular/core`/`@angular/forms`
as your app's own dependencies.

<details>
<summary>Manual install (no generator — an existing app, or you want to wire it yourself)</summary>

```bash
npm install @symbiote-native/angular react-native @angular/core @angular/forms
```

`react-native`, `@angular/core`, and `@angular/forms` (all **>=20**, for stable zoneless change
detection) stay your app's own top-level dependencies. `@angular/forms` is a real peer, not
boilerplate — `text-input`'s `NG_VALUE_ACCESSOR` registration (for `ngModel`/`formControl*`
binding) imports `ControlValueAccessor` from it. Follow [`examples/angular`](../../examples/angular)
for the AOT pipeline (`ngc --watch` alongside Metro — see [Run it](#run-it)) and the Metro config;
there is no wiring script for an existing app.

</details>

---

## Use it

The app is ordinary standalone Angular. The native primitives are lowercase intrinsic tags, same as
every other adapter — Angular still needs them declared in the component's `imports:` array (an
Angular "element directive" is what makes `ngtsc` accept the tag with typed props), so
`SYMBIOTE_ELEMENTS` from `@symbiote-native/angular` covers the whole primitive surface in one import.
Styling is a CSS class against a plain `.css` file — the convention every example app here
follows. A tap→increment counter:

```ts
import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import './App.css';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <text>Taps: {{ count() }}</text>
      <pressable (press)="count.set(count() + 1)">
        <text>Tap me</text>
      </pressable>
    </safe-area-view>
  `,
})
export class AppComponent {
  count = signal(0);
}
```

```css
/* App.css */
.screen {
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
```

<details>
<summary>Native entry point (index.js) — already scaffolded by <code>npx @symbiote-native/cli new --framework angular</code></summary>

The zero-config entry mirrors real Angular's own `bootstrapApplication(RootComponent, config)`
idiom and wires the same RN-backed host seams the other adapters' entries do — this is what
[`examples/angular`](../../examples/angular) actually uses:

```js
// index.js

// Registers host behaviors (Image, Pressable, Switch, ...) that /bootstrap alone doesn't
// reach; deleting this breaks them silently (Metro's production inlineRequires makes a
// side-effect-only barrel import go lazy, see register.ts).
import '@symbiote-native/angular';
import { bootstrapApplication } from '@symbiote-native/angular/bootstrap';
import { AppComponent } from './App';
import { name as appName } from './app.json';

bootstrapApplication(AppComponent, { appName });
```

For anything the defaults don't cover, drive the lower-level seam directly — the same
`registerRunnable` seam React and Vue use, with `mount` from `@symbiote-native/angular` driving the
engine through Angular's `Renderer2`:

```js
// index.js
import { AppRegistry as RNAppRegistry } from 'react-native';
import { mount } from '@symbiote-native/angular';
import { AppComponent } from './App';
import { name as appName } from './app.json';

// registerRunnable (not registerComponent): RN stores a raw mount callback and never renders
// it with its own renderer. We mount the Angular app onto the surface's rootTag.
RNAppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, AppComponent);
});
```

</details>

The full canary is [`examples/angular`](../../examples/angular) — a stock RN 0.86 app whose
[`App.ts`](../../examples/angular/src/App.ts) exercises the same surface as the React and Vue
reference canaries, standalone components, zoneless change detection.

---

## Parity — and the one gap

Angular reaches the same 21+ primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family as React, Vue, Svelte, and Solid, verified
on-device on iOS and Android. That parity is **structural, not
hand-copied**: the component logic (state machines + render functions) is written **once** in
`@symbiote-native/components`, and Angular supplies only its lifecycle (`Renderer2` + zoneless change
detection + the descriptor→`createElement` bridge).

One deliberate gap, tracked, not blocking the canary — **third-party React component packages**
(`@react-native-community/slider`) run only under the React adapter: their body calls React hooks
off the React dispatcher, which is null under Angular. `@symbiote-native/slider` (this repo's own
wrapper) _does_ ship a real Angular build, reachable through the same `createNode`-by-ViewConfig
path Angular uses for its own primitives — that wrapper is what makes a third-party native view
usable from a non-React adapter at all.

Angular is on the docs site's live framework switcher alongside React and Vue — otherwise it's at
full canary parity.

---

## An Angular-specific gotcha — AOT compiles separately from Metro

Angular templates need `ngc` (Angular's own AOT compiler), which Metro cannot run per-file the way
it transforms a Vue SFC or JSX — `ngc` needs whole-program `compilationMode: 'partial'` first, then
`@angular/compiler-cli/linker/babel` drops the linked output into Metro per-file. In practice this
means every `ios`/`android`/`e2e:build:*` script runs `pnpm ng:build` first, and local development
needs `ngc --watch` running alongside Metro — `scripts/dev-with-watch.sh` in
[`examples/angular`](../../examples/angular) does exactly that (`ngc --watch` in the background,
Metro's `react-native start` in the foreground, since Metro reads raw keypresses off stdin and
can't sit behind a process manager that owns stdin itself).

Angular also requires **zoneless change detection** (`provideZonelessChangeDetection`,
`@angular/core >=20`) — zone.js fights Hermes, and versions before 20 don't offer a stable
zoneless API. This is the version floor for the whole adapter, not a suggestion.

`babel.config.js` needs `@babel/plugin-transform-class-static-block`, listed **first**, before
`@symbiote-native/angular`'s own `babel-register-composed` and linker plugins. `ngc` emits static
blocks (`tsconfig.angular.base.json`'s `useDefineForClassFields: false` at ES2022 lowers a static
property initializer to one), and RN's preset doesn't enable that transform — the class-features
plugin then refuses the class outright. This only surfaces in a **Release** build (where that
transform actually runs) and is invisible to every headless check, so a hand-wired app missing it
builds and tests clean right up until the first release build. `npx @symbiote-native/cli new
--framework angular` already includes it; wiring Angular into an existing app by hand needs it
copied from [`examples/angular`](../../examples/angular)'s own `babel.config.js`.

---

## Run it

[`examples/angular`](../../examples/angular) is a stock React Native 0.86 app. Requires Node ≥
22.13 (react-native 0.86's own `package.json#engines`) and the [RN environment
setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode, CocoaPods):

```bash
cd examples/angular
pnpm install                   # workspace root already covers this if you ran it there
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # fetch native pods

# terminal 1 — ngc --watch (background) + Metro (foreground). DEBUG=1 turns on diagnostic logs.
DEBUG=1 pnpm dev

# terminal 2 — build + launch (each runs ng:build first)
pnpm ios                       # iOS simulator
pnpm android                   # Android emulator
```

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot

cd examples/angular
pnpm e2e:build:ios             # ng:build, then build the app for Detox
pnpm e2e:test:ios              # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

Why these come for free — a SymbioteNative app is a stock RN app underneath, so RN's whole testing
ecosystem applies unchanged. See [Testing](../../README.md#testing).
