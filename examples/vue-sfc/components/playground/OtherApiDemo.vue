<!--
  Render Function / Low-level / Misc: h()/createVNode()/cloneVNode()/isVNode()/Fragment/
  withDirectives()/mergeProps() — the primitives `vue-tsx` render functions build on directly,
  exercised here from an ordinary `<script setup>` since a vnode still needs SOME template anchor
  to actually render (`RenderVNode` below, a one-line functional wrapper — the same technique
  CanaryScreen.vue already uses for its RefreshControl's element-valued prop).

  defineAsyncComponent() resolves its loader with a plain in-memory component object instead of a
  real dynamic `import()` — this repo's Metro pipeline doesn't need proving here, only the
  loading/error/delay contract does.

  GAP UPDATE 2026-08-17: `withModifiers()`/`withKeys()` were found missing from both this
  project's typecheck shim and its Metro runtime shim — exported only from `@vue/runtime-dom`,
  never `@vue/runtime-core`, so `import { withModifiers } from 'vue'` failed at both typecheck and
  runtime here. Rather than fake a passing demo around it, the real fix landed in
  `runtime-helpers.ts` itself (pure event-object logic, no DOM dependency, same shape as the
  existing `vShow` shim) — `withModifiers` is now real, demoed below in its render-function/
  programmatic form (its TEMPLATE form, `@press.self`, already has a live demo in the Template
  Directives section above).

  `useCssModule()` stays a genuine, NOT-a-clean-shim gap, still undemoed on purpose: the function
  itself is now a correct copy of upstream Vue's implementation (reads `instance.type.__cssModules`),
  but THIS PROJECT'S OWN `<style module>` compiler (`examples/vue-sfc/metro-vue-transformer.js`,
  documented in the `symbiote-sfc-style-compiler` skill's "Inline Vue `<style module>`" section)
  emits a plain top-level `const $style = {...}` closed over by `setup()`, never `__cssModules` on
  the component's own options — so calling `useCssModule()` against a real `<style module>` block
  here would just hit the "no CSS module named" warning path and return `{}`, not a genuine
  passing demo. Making it work for real means teaching the COMPILER to also emit `__cssModules`,
  not a plain adapter-level function shim — a bigger, different fix than `withModifiers`, left for
  a future task rather than blurred into this one.

  `$refs`/`$slots`/`$emit`/`$parent`/`$root`/`$forceUpdate`/`mixins`/`extends`/`inheritAttrs` are
  NOT re-demoed here even though they're listed under this same "Other" category in the checklist —
  they're the Options-API-instance-property flavor of the exact same surface Component
  Communication's OptionsApiChild already demos live, just above. `resolveComponent`/
  `resolveDirective` are likewise cross-referenced to the Global/Application API section, where
  app.component()/app.directive() register the names they resolve.
-->
<script setup lang="ts">
import {
  ref,
  computed,
  h,
  createVNode,
  cloneVNode,
  isVNode,
  Fragment,
  withDirectives,
  mergeProps,
  defineComponent,
  defineAsyncComponent,
  type VNode,
} from 'vue';
import { withModifiers } from '@symbiote-native/vue/runtime-helpers';
import { View, Text, Pressable } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';
import { vHighlight } from './directives';

const modifierLog = ref<string[]>([]);
function pushModifierLog(entry: string): void {
  modifierLog.value = [...modifierLog.value, entry].slice(-3);
}
const onModifierPress = withModifiers(
  () => pushModifierLog('fired (programmatic .stop)'),
  ['stop'],
);

// Function-signature form of defineComponent (3.3+, the same shorthand
// adapters/vue/src/components/flat-list.ts uses for its own generic component) — typed straight
// off the setup function's own parameter, no PropType<T> cast needed.
const RenderVNode = defineComponent(
  (props: { node: VNode }) => () => props.node,
  { props: ['node'] },
);

const tone = ref('#f5a623');
const baseVNode = computed(() =>
  createVNode(
    Text,
    mergeProps({ class: 'note-text' }, { style: { color: tone.value } }),
    () => `h()/createVNode() built this · tone=${tone.value}`,
  ),
);
const clonedVNode = computed(() =>
  cloneVNode(baseVNode.value, { style: { color: '#42b883' } }),
);
const fragmentVNode = computed(() =>
  h(Fragment, [
    h(Text, { class: 'note-text' }, () => 'Fragment child 1'),
    h(Text, { class: 'note-text' }, () => 'Fragment child 2'),
  ]),
);
const isVNodeCheck = computed(() => isVNode(baseVNode.value));

const glowOn = ref(false);
const directedVNode = computed(() =>
  withDirectives(h(View, { class: 'chip' }), [[vHighlight, glowOn.value]]),
);

const AsyncBadgeReal = defineComponent({
  setup: () => () =>
    h(View, { class: 'chip' }, [h(Text, { class: 'chip-text' }, () => 'OK')]),
});
const LoadingStub = defineComponent({
  setup: () => () => h(Text, { class: 'note-text' }, () => 'async loading…'),
});
const ErrorStub = defineComponent({
  setup: () => () => h(Text, { class: 'note-text' }, () => 'async failed'),
});
const AsyncWidget = defineAsyncComponent({
  loader: () =>
    new Promise<typeof AsyncBadgeReal>(resolve =>
      setTimeout(() => resolve(AsyncBadgeReal), 700),
    ),
  loadingComponent: LoadingStub,
  errorComponent: ErrorStub,
  delay: 150,
  timeout: 5000,
});
const asyncLoadTriggered = ref(false);
</script>

<template>
  <View class="section-tight">
    <Text class="section-label"
      >Other —
      h()/createVNode/cloneVNode/isVNode/Fragment/withDirectives/mergeProps</Text
    >
    <RenderVNode :node="baseVNode" />
    <RenderVNode :node="clonedVNode" />
    <RenderVNode :node="fragmentVNode" />
    <Text class="note-text" testID="other-is-vnode">{{
      `isVNode(baseVNode)=${isVNodeCheck}`
    }}</Text>

    <Text class="note-text"
      >withDirectives() — the SAME v-highlight directive as the Template
      Directives demo, applied programmatically</Text
    >
    <ActionButton
      testID="other-toggle-glow"
      :title="glowOn ? 'glow: on' : 'glow: off'"
      :onPress="() => (glowOn = !glowOn)"
      color="#f5a623"
    />
    <RenderVNode :node="directedVNode" />

    <Text class="note-text"
      >defineAsyncComponent — loadingComponent → resolved component, with a
      150ms delay before the loader shows</Text
    >
    <ActionButton
      testID="other-load-async"
      title="load async component"
      :onPress="() => (asyncLoadTriggered = true)"
      color="#f5a623"
    />
    <component :is="AsyncWidget" v-if="asyncLoadTriggered" />

    <Text class="note-text"
      >withModifiers() — programmatic form, the .stop modifier bound by hand
      instead of via @press.stop (needs the real press event, unlike
      ActionButton's zero-arg onPress, so this uses a plain Pressable)</Text
    >
    <Pressable
      testID="other-modifier-press"
      class="chip"
      :onPress="onModifierPress"
    >
      <Text class="chip-text">press (wrapped in withModifiers)</Text>
    </Pressable>
    <Text class="note-text" testID="other-modifier-log">{{
      modifierLog.join(' · ') || '(not pressed yet)'
    }}</Text>

    <Text class="note-text" testID="other-css-module-gap"
      >useCssModule() — real function now, but unreachable here: this project's
      &lt;style module&gt; compiler emits a plain `$style` const, not the
      `__cssModules` instance option this function reads (see the file header
      comment above).</Text
    >
  </View>
</template>
