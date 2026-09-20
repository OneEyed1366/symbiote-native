// The ellipsize modes a Text accepts. THE DEFAULTS THAT USED TO BE APPLIED HERE ARE GONE (2026-09-18)
// — they are the platform's, so they live in the engine's payload builder and reach every `RCTText`
// whoever authored it: `foldTextDefaults`, `SymbioteFabricProps.cpp`.
//
// `resolveTextProps` was the third implementation of a two-line rule. Its one runtime caller was
// Button's label, which wrote both keys onto a node the builder was about to default anyway — the
// same seed shape `seedTextDefaults` had in three adapters, at a smaller scale. The rule reaches
// that node by being keyed on the COMPONENT, so nothing has to hand it down.
//
// Why the original fold existed at all, kept because the bug is easy to reintroduce: we declared both
// props in all four adapters and applied NEITHER default, so native fell back to its own `clip`.
// Device-observed 2026-08-19 on examples/svelte — a Text with `numberOfLines={1}` cut mid-word with
// no ellipsis. Nothing failed; the text was simply wrong.

export type IEllipsizeMode = 'head' | 'middle' | 'tail' | 'clip';
