<script lang="ts">
  // A component-local style block, and specifically the COMPOUND selector inside it —
  // `.badge.loud` applies only to an element carrying both tokens, and layers over `.badge`
  // rather than replacing it. That combination was silently dead until 2026-08-14 (the scope
  // suffix is appended per markup token, while the registered key carries it once at the end;
  // symbiote-sfc-style-compiler skill §5b), so it is on screen here to keep it honest.
  //
  // What each badge proves:
  //   plain    — `.badge` alone; the compound rule must NOT reach it.
  //   loud     — static `class="badge loud"`; `.badge`'s radius/padding survive, `.badge.loud`
  //              wins the two colours it restates. `.loud` has no standalone rule of its own,
  //              which is the arrangement that also needed the token list, not just the key.
  //   dynamic  — the same pair through a clsx array the compiler cannot read, so it is scoped
  //              at runtime instead of at build time. Both paths must agree.
  //
  // The dynamic badge's LABEL is deliberately constant: the e2e journey proves the rule by
  // screenshot-diffing that badge across the toggle, and a label that changed with the state
  // would make the diff pass even with the compound rule dead.
  //
  // `section-nested` / `section-label` / `row` are NOT defined below — they come from App.css
  // and pass through unscoped, which is the other half of the rule.
  import { View, Text } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  let isLoud = $state(false);
</script>

<!-- Edge-to-edge markup between siblings: svelte-adapter-dom-shim skill §16 (whitespace between
     symbiote-*-producing tags compiles to a real, invalid RCTRawText child). -->
<View class="section-nested"
  ><Text class="section-label">Compound class · scoped style block</Text><View
    class="row"
    ><View class="badge" testID="compound-badge-plain"
      ><Text class="badge-text">plain</Text></View
    ><View class="badge loud" testID="compound-badge-loud"
      ><Text class="badge-text">loud</Text></View
    ><View class={['badge', isLoud && 'loud']} testID="compound-badge-dynamic"
      ><Text class="badge-text">dynamic</Text></View
    ></View
  ><Text class="note-text" testID="compound-badge-readout"
    >{isLoud
      ? 'dynamic badge carries both tokens — flame border, same pill shape'
      : 'dynamic badge carries only .badge — grey border'}</Text
  ><ActionButton
    testID="compound-badge-toggle"
    title={isLoud ? 'Drop .loud' : 'Add .loud'}
    color="#ff3e00"
    onPress={() => (isLoud = !isLoud)}
  /></View
>

<style>
  .badge {
    padding: 8px;
    border-radius: 999px;
    border-width: 1px;
    border-color: #3a3a3a;
    background-color: #262626;
  }

  /* Restates ONLY the two colours: the padding and radius above must survive on `badge loud`. */
  .badge.loud {
    border-color: #ff3e00;
    background-color: #3a1400;
  }

  .badge-text {
    font-size: 13px;
    color: #c8c8c8;
  }
</style>
