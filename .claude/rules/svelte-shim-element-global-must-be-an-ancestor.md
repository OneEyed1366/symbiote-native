---
paths:
  - 'adapters/svelte/src/dom-shim/patch-globals.ts'
  - 'adapters/svelte/src/dom-shim/element.ts'
---

# `globalThis.Element` must be an ANCESTOR of `ShimElement`, never `ShimElement` itself

`patchGlobals()` set `g.Element = ShimElement`, which reads as obviously right and silently broke
**every Svelte API that routes through `set_attributes`**. Svelte's `get_setters`
(`internal/client/dom/elements/attributes.js`) walks from the ELEMENT INSTANCE up and stops when it
reaches `Element.prototype`. Pointing `Element` at the class that OWNS the setters puts the stop one
step before them:

```
visited before the stop   ['ShimElement']   the instance alone
setters found             []                `p` lives on ShimElement.prototype, never reached
```

`set_attributes` then falls through to `setAttribute`, which writes an inert Map — so the props
vanish with nothing red. Measured 2026-09-01: `<svelte:element this="symbiote-view" p={{…}}>`
committed NOTHING while the identical bag on a literal `<symbiote-view>` committed correctly in the
same run, because the literal tag takes `set_custom_element_data` and never goes near `get_setters`.

The fix is an empty `ShimElementBase` between `ShimNode` and `ShimElement`, with
`g.Element = ShimElementBase`. Three lines, no allocation. **Not** "install an Element global" — it
was installed; the hierarchy was the lie.

Two things that travel with it:

- **`set_style` writes `dom.style.cssText`**, so a shim with no `.style` THROWS rather than
  no-opping. Keep that slot LAZY — an eager field is one object per element, ~9 000 per create, the
  exact shape `svelte-shim-is-the-per-node-create-path.md` records for the two Maps beside it.
- **This did not make bare tags work.** `<symbiote-view id="x" testID="y">` and
  `<svelte:element … id testID>` still commit nothing: individual attributes are not setters on the
  prototype, so they land in the same inert Map. Routing per-key into `routeProp` is a separate and
  much larger change. Do not let a summary read as "bare tags work now".

Status: LANDED 2026-09-01. The cost is one extra prototype link, **below the headless bench's
floor** rather than shown to be free — four interleaved runs of 9 000 constructions read before
`0.7409 0.7422 0.7582 0.7612` and after `0.7394 0.7499 0.7525 0.7640`. Headless has mis-sized this
class of cost three times in both directions, so a device pair (both arms one sitting, one
simulator, differing only in the shim) is what settles it; the 2026-08-23 Svelte column cannot serve
as a before-arm, being a different engine build and a different binary.

**What this makes FALSE once it ships**, and it is written down in two places as a law rather than a
defect: `examples/svelte/components/api-playground/SpecialElementsDemo.svelte` says props on a
dynamic tag "MUST go through `{@attach hostProps(...)}`, never a `p={bag}` attribute", and
`BindingsDemo.svelte` inherits the same caveat. That was true and is the workaround this fix
removes — `p={{…}}` on a `<svelte:element>` now commits the same payload as a literal tag. The
adapter's own `scroll-view/index.svelte` and `virtualized-list/index.svelte` headers likewise call
`<svelte:element>` "unverified under the DOM shim" / "forbidden", which is now only half true: the
mechanism works, the remaining reason to avoid it is per-attribute props, not the tag.

Surrounding contract: the `svelte-adapter-dom-shim` skill, §3a (what `init_operations` requires of
these prototypes) and §3g (why a lowered element uses the object-bag property instead).
