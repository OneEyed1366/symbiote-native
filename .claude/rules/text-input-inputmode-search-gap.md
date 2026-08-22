---
paths:
  - 'core/components/src/state/text-input.ts'
---

# The TextInput token maps are RN-verified — and how the one divergence was resolved

Closed 2026-08-18. `inputMode="search"` used to resolve to the plain `default` keyboard on every
host; RN gives iOS `web-search`, the keyboard whose return key is a magnifier
(`.vendors/react-native/.../TextInput/TextInput.js:815-825`). Every adapter inherited the flat
value, and **no adapter test could have caught it** — all of them call `resolveTextInputProps`, the
very function carrying the wrong value, so they agreed with each other and stayed green.

## What was verified, once

All four token maps were diffed against RN's source in the same pass:

| map                                | result                                |
| ---------------------------------- | ------------------------------------- |
| `autoCompleteWebToAndroid`         | 30 entries, identical to RN           |
| `autoCompleteWebToTextContentType` | 36 entries, identical to RN           |
| `enterKeyHintToReturnKeyType`      | 7 entries, identical to RN            |
| `inputModeToKeyboardType`          | identical except `search` — now fixed |

If you change any of these, re-run that diff rather than eyeballing: the values are RN internals,
not a public contract, and a single wrong string is invisible from inside our own tests.

## The shape the fix took, and why

```ts
export function keyboardTypeForInputMode(
  inputMode: string,
  os: IPlatformOSType,
): string | undefined;
```

The host is an ARGUMENT, not a `Platform.OS` read inside the body. The headless Platform module
always resolves to iOS (`platform/index.ts` re-exports `index.ios`), so a direct read would leave
the Android branch permanently unprovable. `resolveTextInputProps` supplies the real value, which is
why the exported fold signature did not change and no adapter needed editing.

`search` was REMOVED from `inputModeToKeyboardType` rather than left there and overridden — one
source, so a map entry and an override cannot drift apart.

Same trick, same reason: `keyboardAvoidingEventNamesFor(os)` and
`readPrefersCrossFadeTransitions(query?)` in `render-keyboard-avoiding-view.ts`. Prefer it whenever a
pure function in `core/components` would otherwise reach for host state — see
`.claude/rules/keyboard-avoiding-view-rn-contract.md` Trap 2.

## Still open

`core/components/src/state/text-input.ts` now has a co-located unit test (64 assertions). Nothing
else in it is known to diverge.
