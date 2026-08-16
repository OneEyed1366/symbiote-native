---
'@symbiote-native/components': minor
'@symbiote-native/angular': minor
'@symbiote-native/react': minor
'@symbiote-native/svelte': minor
'@symbiote-native/vue': minor
---

Correct `Modal`'s `onOrientationChange` signature, which promised a payload it never delivered. The
engine registers every `onX` listener as `(event: ISymbioteEvent) => handler(event)`, so a handler
always receives the full wrapper. `onShow` / `onRequestClose` / `onDismiss` never noticed because
they declare no argument, but `onOrientationChange` was typed against the unwrapped payload - a
caller following the type read `event.orientation` and got `undefined` forever, while the value sat
at `event.nativeEvent.orientation`.

The handler is now typed `(event: ISymbioteEvent) => void` on every adapter, matching every other
payload-carrying event in the codebase (`onLayout`, `onAccessibilityAction`, the press and scroll
handlers), each of which narrows at the read site. `IModalOrientationChangeEvent` stays exported and
is now documented as what it truthfully describes: the `nativeEvent` payload shape, not the handler
argument.

Code reading `event.orientation` will now fail to compile rather than silently receive `undefined`.
Read `event.nativeEvent.orientation` instead.

Angular additionally stops normalizing the event into `{ orientation }` - a divergence from the
other three adapters that also swallowed the event entirely when the payload was not one of the two
values it recognized.
