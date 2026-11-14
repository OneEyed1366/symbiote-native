# @symbiote-native/web

The web platform of SymbioteNative: a DOM implementation of the engine's tree host. Every adapter (React, Vue, Solid, Svelte, Angular) renders into a page through the same engine, with no react-native-web renderer in the path.

Status: first milestone. View, Text, Image, ScrollView, TextInput, Pressable, Button, Switch and ActivityIndicator are covered, the rest of the component set is not.

## Shape

- `bootWebHost` installs the DOM host as the engine's tree host and returns a root tag for `createSurface`.
- Each prop reaches the page through per-view rule sets (`view-rules.ts`): classes from one reset sheet, inline CSS, attributes.
- Page events (pointer, click, key, scroll, input) are forwarded as the Fabric events the engine already understands.

## Use it

An adapter's web entry calls `startApp` from `@symbiote-native/components`, which runs the app on the element with the id `root`. An app does not import this package directly.

## Test it

- `@symbiote-native/web/canary` mounts one screen on a page and reads the facts it leaves, the parity check every adapter runs.
- `@symbiote-native/web/interactions` holds the gestures a person makes (`tapElement`, `clickElement`, `typeInto`, `scrollElementTo`) for tests under `happy-dom`.

## Known gaps

No DOM form for `borderCurve`, `elevation`, `textAlignVertical`, `includeFontPadding` and `hitSlop`. `snapToInterval`, `snapToOffsets` and `contentInset` of a ScrollView, Modal and drag-to-toggle of a Switch are not done.
