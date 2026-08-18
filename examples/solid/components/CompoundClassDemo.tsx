// The COMPOUND selector — `.badge.loud` applies only to an element carrying both tokens, and
// layers OVER `.badge` rather than replacing it. That combination was silently dead until
// 2026-08-14 (symbiote-sfc-style-compiler skill §5b), so it is on screen here to keep it honest.
//
// What each badge proves:
//   plain    — `.badge` alone; the compound rule must NOT reach it.
//   loud     — static `class="badge loud"`; `.badge`'s radius/padding survive, `.badge.loud` wins
//              the two colours it restates. `.loud` has no standalone rule of its own, which is
//              the arrangement that also needed the token list, not just the key.
//   dynamic  — the same pair through a runtime-computed string the compiler cannot read, so it is
//              resolved at runtime instead of at build time. Both paths must agree.
//
// The dynamic badge's LABEL is deliberately constant: the e2e journey proves the rule by
// screenshot-diffing that badge across the toggle, and a label that changed with the state would
// make the diff pass even with the compound rule dead.
//
// WHERE THIS DIVERGES FROM THE SVELTE AND VUE TWINS. Both wrap the same three badges in a SCOPED
// style block (`<style scoped>` / Svelte's default scoping), so their demo covers scope×compound
// as well. Solid has no SFC, and its only per-file scoping is a `.module.css` — whose suffix shape
// the engine's compound lookup cannot factor back out (see CompoundClassDemo.css). So this canary
// covers the compound half only, at global scope, and the scoped half stays uncovered on Solid
// rather than being faked.
//
// `section-nested` / `section-label` / `row` come from App.css and pass through untouched, which
// is the other half of the rule.

import { createSignal } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';
import './CompoundClassDemo.css';

export function CompoundClassDemo() {
  const [isLoud, setIsLoud] = createSignal(false);

  return (
    <View class="section-nested">
      <Text class="section-label">
        Compound class · layered over the base rule
      </Text>
      <View class="row">
        <View class="badge" testID="compound-badge-plain">
          <Text class="badge-text">plain</Text>
        </View>
        <View class="badge loud" testID="compound-badge-loud">
          <Text class="badge-text">loud</Text>
        </View>
        {/* One string rather than an array: IClassNameValue's array member is
            `string | IResolvedStyle`, so Svelte's `['badge', isLoud && 'loud']` shape has no
            type-safe spelling here — and a ternary is the same runtime-opaque input anyway. */}
        <View
          class={isLoud() ? 'badge loud' : 'badge'}
          testID="compound-badge-dynamic"
        >
          <Text class="badge-text">dynamic</Text>
        </View>
      </View>
      <Text class="badge-readout" testID="compound-badge-readout">
        {isLoud()
          ? 'dynamic badge carries both tokens — blue border, same pill shape'
          : 'dynamic badge carries only .badge — grey border'}
      </Text>
      <ActionButton
        testID="compound-badge-toggle"
        title={isLoud() ? 'Drop .loud' : 'Add .loud'}
        color="#7aa2e3"
        onPress={() => setIsLoud(loud => !loud)}
      />
    </View>
  );
}
