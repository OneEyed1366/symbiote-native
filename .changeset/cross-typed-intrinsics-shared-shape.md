---
'@symbiote-native/components': patch
---

Add `ICrossTypedIntrinsics<LooseProps, Crossed>`, the one shared shape behind every adapter's
intrinsic-element type table: every tag gets a loose attribute bag by default except the ones the
adapter has a real per-tag prop type for, which get that type instead (`Omit` the crossed keys out
of the loose record, merge the real ones back in). The mechanics were duplicated per adapter before
this; only the prop types genuinely differ (`children`/`ref` are framework values, so a type like
`IViewProps` can't be fully shared) — this generic lets an adapter's own table stay a one-line
instantiation instead of re-deriving the `Omit<Record<...>, keyof Crossed> & Crossed` shape by hand.
