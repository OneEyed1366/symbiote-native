<script lang="ts">
  // StatusBar, the Svelte lifecycle half. The native StatusBarManager driving
  // (applyStatusBarProps), the imperative statics, and the Android bar-height constant all
  // live in @symbiote-native/engine, shared verbatim with React/Vue; Metro selects the
  // engine's status-bar.ios.ts / status-bar.android.ts per host, so the platform divergence
  // never reaches this file. Svelte supplies only the declarative shape: a component that
  // renders no Fabric view (empty template) and re-applies the props through an `$effect` on
  // mount + every prop change — the Svelte twin of Vue's watchEffect / React's useEffect.
  //
  // Unlike Vue's twin (status-bar.ts), no untyped-attrs guard layer is needed: Svelte's
  // `$props()` already destructures real typed fields straight from the compiler, so there is
  // no kebab-case-attrs normalization step to run first.
  import { applyStatusBarProps, type IStatusBarProps } from '@symbiote-native/engine';

  let props: IStatusBarProps = $props();

  $effect(() => {
    applyStatusBarProps(props);
  });
</script>
