---
paths:
  - core/engine/cpp/**
  - core/engine/src/fabric-props.ts
---

# The device builds its payload in C++, so a narrowing there is invisible to every test we have

`core/engine/src/fabric-props.ts` is the reference; `core/engine/cpp/SymbioteFabricProps.cpp` is a
second implementation of it, and the device runs the second one. Every headless test drives the
first (`core/test-utils/src/tree-applier.ts` calls the TS `fabricProps`), so a value the C++ half
converts differently is green everywhere and wrong only on a phone.

The JS half converts colours by handing the string to RN's own `processColor`, which is injected.
The C++ half cannot call into JS mid-walk, so it has to own a grammar — and that is the seam where
the two drift.

## What it cost, 2026-09-09

`processColorValue` parsed `#hex` and comma-`rgb()` and let every other spelling through as a
STRING. `PlatformColorParser.mm` answers a string with `clearColor()`, and
`enableNativeCSSParsing()` is false by default, so `backgroundColor: 'hsl(...)'` painted
transparent. The canary's chip list is coloured with `hsl()`, so a whole FlatList looked absent —
on all five adapters at once, because the C++ is shared. A day went into windowing, layout and the
horizontal ScrollView before anything looked at colour, and the C++ file's own comment had named
the ceiling in writing the whole time.

Two things generalise:

- **A defect on every adapter at once points BELOW the adapters**, and today that means C++ before
  it means the engine's JS.
- **A "ceiling" recorded in a comment is a known defect with a date on it.** That one said
  `hsl()` passes through "which leaves the device behaviour no worse than it is today" — true, and
  the behaviour it preserved was invisible content.

## The rule the three instances add up to

**Whatever the C++ half cannot do has to happen BEFORE the C++ half sees the value.** Not ported
into it — moved earlier, into JS, where it already works. Three times in one day, three layers:

```
what                                  where it went
a CSS colour grammar                  RN's own parseCSSProperty<CSSColor>, in C++
a third-party view's own processors   configPayloadFold, on the node, called BY the C++
the seven structured style keys       structured-style.ts, at write time, before the op
```

Only the first belonged in C++, because a grammar is not a JS closure and RN ships one. The other
two are JS by nature, and each was closed by moving it upstream of the boundary instead of
re-implementing it downstream. **Before porting anything into `cpp/`, ask whether it can run
earlier instead** — the answer has been yes twice, and porting would have meant a second
implementation to keep in step, which is the failure this whole file is about.

The write-time move has one contract worth naming: it must return the SAME object when it changes
nothing. `pushClassStyle` compares what it is about to publish against what it published last, and
the host skips a same-identity write — a resolver minting a fresh object per write turns every
unchanged class into a write and a dirty node, which is invisible on React/Vue/Svelte and 500x on
Solid.

## And the mirror case: a difference from the retired JS half is not automatically a regression

Where the C++ calls React Native's OWN function, it is the JS port that was wrong. Reported
2026-09-10 as "`measure` changes `page` but not `frame`, in JS everything changed": correct, and the
correct half is the current one. `Tree::measure` calls `react::dom::measure`, which returns
`originRelativeToParent` for x/y and the root-relative origin for pageX/pageY (`DOM.cpp`) — so
scrolling moves one pair and not the other, by design.

So when a behaviour changes with the move to C++, check which side calls upstream BEFORE calling it
a regression. The demo was relabelled instead ("in parent" / "from root"), because a readout that
cannot say which question it answers gets filed as a bug — the `canary-visual-defects.md` rule, in
an imperative API rather than a visual one.

## The same seam, one layer over: WHICH keys are colours

Found an hour later, on `@symbiote-native/slider`. The reference asks a third-party view's own
`validAttributes[*].process` first, and that registry is built in JS from
`ReactNativeViewConfigRegistry` — the C++ cannot reach it mid-walk, so it carried a hand-copied
list of colour NAMES instead. `thumbTintColor` was on it and painted; `minimumTrackTintColor` and
`maximumTrackTintColor` were not. A thumb over no track, values updating correctly as it dragged.

Same shape as the grammar: a closed enumeration standing in for something open. Closed by taking
any key ending in `Color` as well, which needs no list to be kept in step and covers a component
nobody has written yet. Only the names that do not end that way still have to be listed —
`underlineColorAndroid`, `trackColorForTrue`, `trackColorForFalse`.

**A missing colour is an invisible ELEMENT, never a wrong shade** — twice in one day the report was
"X is not rendered" and the answer was a colour key nothing recognised.

## Before adding a grammar to the C++ half, check whether RN ships one

`install_modules_dependencies` already puts `React-renderercss` on our podspec, and
`ReactAndroid/build.gradle.kts` exports `react/renderer/css/` plus `fast_float` to the prefab — so
`parseCSSProperty<CSSColor>` costs nothing on either platform. That replaced the hand-rolled
`rgb()` parser. Same question applies to whatever is ported next: RN's own header is one
dependency we already have, a second hand-rolled grammar is one more thing to keep in step.

## The check, since no test can run this

There is no C++ test harness in this repo. Compile the function alone and print a table:

```bash
R=.vendors/react-native/packages/react-native/ReactCommon
F=examples/solid/ios/Pods/fast_float/include
clang++ -std=c++20 -I "$R" -I "$F" probe.cpp -o probe && ./probe
```

Then compare the numbers against the JS reference for the same inputs — RN's `processColor` in
node, or the adapter's `processColor` printed on a device screen. Equal numbers is the assertion;
the two halves agreeing is the only property that matters. Verified that way for the colour fix:
`hsl(120 70% 55%)` → `4282178876` from RN's JS, from the C++ parser, and from the device.
