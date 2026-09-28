<!-- Render Function / Low-level / Misc: h()/createVNode()/cloneVNode()/isVNode()/Fragment/
  withDirectives()/mergeProps() — the primitives `vue-tsx` render functions build on directly.
  Exercised here since a vnode still needs SOME anchor (`RenderVNode`, a one-line wrapper). -->

<!-- defineAsyncComponent() resolves its loader with a plain in-memory component object, not a real
  dynamic `import()` — only the loading/error/delay contract needs proving here. -->

<!-- `withModifiers`/`withKeys` ship only from `@vue/runtime-dom`, never `@vue/runtime-core`, so
  importing from `vue` fails here. Fixed in `runtime-helpers.ts` (pure event-object logic,
  same shape as the `vShow` shim). -->

<!-- `useCssModule()` stays undemoed: it's a correct copy of upstream Vue, but this project's own
  `<style module>` compiler emits a plain `const $style` closed over by `setup()`, never
  `__cssModules` — fixing it means teaching the COMPILER to emit that, a separate task. -->

<!-- `$refs`/`$slots`/`$emit`/`$parent`/`$root`/`mixins`/`extends`/`inheritAttrs` are NOT re-demoed:
  they're the Options-API flavor of what Component Communication's OptionsApiChild already demos.
  `resolveComponent`/`resolveDirective` are cross-referenced to Global/Application API. -->
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
    'text',
    mergeProps({ class: 'note-text' }, { style: { color: tone.value } }),
    () => `h()/createVNode() built this · tone=${tone.value}`,
  ),
);
const clonedVNode = computed(() =>
  cloneVNode(baseVNode.value, { style: { color: '#42b883' } }),
);
const fragmentVNode = computed(() =>
  h(Fragment, [
    h('text', { class: 'note-text' }, () => 'Fragment child 1'),
    h('text', { class: 'note-text' }, () => 'Fragment child 2'),
  ]),
);
const isVNodeCheck = computed(() => isVNode(baseVNode.value));

const glowOn = ref(false);
const directedVNode = computed(() =>
  withDirectives(h('view', { class: 'chip' }), [[vHighlight, glowOn.value]]),
);

const AsyncBadgeReal = defineComponent({
  setup: () => () =>
    h('view', { class: 'chip' }, [
      h('text', { class: 'chip-text' }, () => 'OK'),
    ]),
});
const LoadingStub = defineComponent({
  setup: () => () => h('text', { class: 'note-text' }, () => 'async loading…'),
});
const ErrorStub = defineComponent({
  setup: () => () => h('text', { class: 'note-text' }, () => 'async failed'),
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
  <view class="section-tight">
    <text class="section-label">
      Other —
      h()/createVNode/cloneVNode/isVNode/Fragment/withDirectives/mergeProps
    </text>
    <RenderVNode :node="baseVNode" />
    <RenderVNode :node="clonedVNode" />
    <RenderVNode :node="fragmentVNode" />
    <text class="note-text" testID="other-is-vnode">
      {{ `isVNode(baseVNode)=${isVNodeCheck}` }}
    </text>

    <text class="note-text">
      withDirectives() — the SAME v-highlight directive as the Template
      Directives demo, applied programmatically
    </text>
    <ActionButton
      testID="other-toggle-glow"
      :title="glowOn ? 'glow: on' : 'glow: off'"
      :onPress="() => (glowOn = !glowOn)"
      color="#f5a623"
    />
    <RenderVNode :node="directedVNode" />

    <text class="note-text">
      defineAsyncComponent — loadingComponent → resolved component, with a 150ms
      delay before the loader shows
    </text>
    <ActionButton
      testID="other-load-async"
      title="load async component"
      :onPress="() => (asyncLoadTriggered = true)"
      color="#f5a623"
    />
    <component :is="AsyncWidget" v-if="asyncLoadTriggered" />

    <text class="note-text">
      withModifiers() — programmatic form, the .stop modifier bound by hand
      instead of via @press.stop (needs the real press event, unlike
      ActionButton's zero-arg onPress, so this uses a plain Pressable)
    </text>
    <pressable
      testID="other-modifier-press"
      class="chip"
      :onPress="onModifierPress"
    >
      <text class="chip-text"> press (wrapped in withModifiers) </text>
    </pressable>
    <text class="note-text" testID="other-modifier-log">
      {{ modifierLog.join(' · ') || '(not pressed yet)' }}
    </text>

    <text class="note-text" testID="other-css-module-gap">
      useCssModule() — real function now, but unreachable here: this project's
      &lt;style module&gt; compiler emits a plain `$style` const, not the
      `__cssModules` instance option this function reads (see the file header
      comment above).
    </text>
  </view>
</template>
