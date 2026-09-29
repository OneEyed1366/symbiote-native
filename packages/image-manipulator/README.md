# @symbiote-native/image-manipulator

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-image-manipulator`](https://github.com/expo/expo/tree/main/packages/expo-image-manipulator)
— resizing, rotating, flipping and cropping images, rendering to a new file — usable from
**every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Built the same way as
[`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --image-manipulator
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --image-manipulator
```

Either way: installs `@symbiote-native/image-manipulator` and wires the native autolinking
automatically — see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI — installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/image-manipulator
```

`expo-image-manipulator` and `expo-modules-core` come along as regular, pinned dependencies —
never install either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares — see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### No permissions, no config plugin

- **No runtime permission on either platform.** The module only ever touches a URI/file the
  caller already has access to — no camera, no photo library.
- **No manifest edit.** `expo-image-manipulator`'s own `AndroidManifest.xml` declares nothing.
- **No config plugin.** Upstream ships none.

</details>

## Shape

```
src/core/                 manipulate + manipulateAsync + FlipType + SaveFormat + the shared
                          releasing-context controller. native-module.ts resolves
                          ExpoImageManipulator through expo-modules-core's requireNativeModule.
src/react/                useImageManipulator (hook)
src/vue/                  useImageManipulator (composable)
src/solid/                useImageManipulator (primitive)
src/svelte/               useImageManipulator (rune)
src/angular/              injectImageManipulator
```

`manipulate`/`manipulateAsync`/`FlipType`/`SaveFormat` stay framework-agnostic free functions,
re-exported by every adapter's own barrel. Upstream's `useImageManipulator` is ported to
**every** adapter, not just React: the recreate/release rule lives once in
`src/core/manipulator-context-controller.ts`, each adapter supplies only its own reactive
lifecycle, per this project's `components_split_logic_view_lifecycle` convention.

## Use it

The current, chainable API (mirrors upstream's `ImageManipulator.manipulate`/`ImageManipulatorContext`):

```ts
import { manipulate } from '@symbiote-native/image-manipulator';

const context = manipulate('file:///photo.jpg');
context.resize({ width: 300 }).rotate(90);
const image = await context.renderAsync();
const { uri, width, height } = await image.saveAsync({ format: 'jpeg', compress: 0.8 });

// Free the native memory once done — no lifecycle wrapper here (framework-agnostic core), each
// adapter's own hook/composable/service is responsible for calling `.release()` on unmount.
context.release();
image.release();
```

The deprecated, one-shot API (kept for parity — upstream still ships it too):

```ts
import { manipulateAsync, SaveFormat } from '@symbiote-native/image-manipulator';

const { uri } = await manipulateAsync(
  'file:///photo.jpg',
  [{ resize: { width: 300 } }, { rotate: 90 }],
  { format: SaveFormat.JPEG, compress: 0.8 },
);
```

## API

| Export            | Signature                                                                | Notes                                          |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `manipulate`       | `(source: string \| IImageRef) => IImageManipulatorContext`              | Chainable `resize`/`rotate`/`flip`/`crop`/`reset`/`renderAsync`. |
| `manipulateAsync`  | `(uri, actions?, saveOptions?) => Promise<IImageResult>`                  | @deprecated — replaced by `manipulate`.        |
| `FlipType`         | `{ Vertical, Horizontal }`                                                | Enum for the `flip` action.                    |
| `SaveFormat`       | `{ JPEG, PNG, WEBP }`                                                     | Enum for `ISaveOptions.format`.                |

## Declarative `useImageManipulator`

```
useImageManipulator(source) -> IImageManipulatorContext
```

React takes a plain value, re-invoked per render (matches upstream exactly). Vue/Solid/Svelte
take a reactive source (`Ref`/getter/`MaybeRefOrGetter`/accessor) so switching it recreates the
context and releases the stale one. Angular's `injectImageManipulator(source)` takes a `Signal`
and returns one, `injectX` shape matching `@symbiote-native/navigation`'s
`injectLinkingIntegration`.

## Notes

- **`extent` action is not ported.** It's web-only in upstream — neither the iOS nor the Android
  native module registers an `extent` function (verified by reading both `ImageManipulatorModule`
  sources). Calling `.extent()` on a native context is a type error here, matching runtime reality.
- **`ImageManipulator.Image` (the hidden native class property) is not exposed.** Upstream itself
  marks it `@hidden` — only reachable indirectly via `context.renderAsync()`'s resolved `IImageRef`.

## Test it

```bash
pnpm vitest run packages/image-manipulator
```

Upstream ships one test suite, `src/__tests__/validators-test.ts` — ported to
`validators.test.ts` (minus the `extent` cases, see above). `image-manipulator.test.ts` is net-new
coverage of `manipulate`/`manipulateAsync` against a faked native module.
