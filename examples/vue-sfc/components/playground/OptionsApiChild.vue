<!--
  The ONLY Options-API component in this codebase (every other component here is Composition-API
  function style, per .docs/framework-api-surface/vue.md's own note) — written specifically to
  exercise the Options-API-flavored rows the Composition-API half of this screen has no natural
  angle on: props/emits as OPTIONS (not defineProps/defineEmits macros), `mixins`, `extends`,
  `inheritAttrs`, and the `this.$refs`/`this.$slots`/`this.$emit`/`this.$parent`/`this.$root`/
  `this.$forceUpdate` instance-property family. Plain `<script>`, not `<script setup>` — Options
  API components cannot use `<script setup>`.
-->
<script lang="ts">
import { defineComponent } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';
import { loggingMixin, baseCounterOptions } from './options-api-shared';

// A plain (non-reactive) instance counter, mutated OUTSIDE Vue's reactivity system on purpose —
// the point of $forceUpdate() is re-rendering when something Vue can't see itself changed.
let externalTicks = 0;

export default defineComponent({
  name: 'OptionsApiChild',
  components: { View, Text, ActionButton },
  extends: baseCounterOptions,
  mixins: [loggingMixin],
  inheritAttrs: false,
  props: {
    seed: { type: Number, required: true },
  },
  emits: ['ping'],
  data() {
    return {
      count: 0,
      hasInnerRef: false,
      hasParent: false,
      hasRoot: false,
      hasDefaultSlot: false,
    };
  },
  mounted() {
    this.hasInnerRef = !!this.$refs.innerBox;
    this.hasParent = !!this.$parent;
    this.hasRoot = !!this.$root;
    this.hasDefaultSlot = !!this.$slots.default;
  },
  methods: {
    bump(): void {
      this.count += 1;
      this.$emit('ping', this.count);
    },
    bumpExternal(): void {
      externalTicks += 1;
    },
    forceRerender(): void {
      this.$forceUpdate();
    },
    externalTicksSnapshot(): number {
      return externalTicks;
    },
  },
});
</script>

<template>
  <View
    ref="innerBox"
    class="a11y-card"
    :style="{ borderWidth: 1, borderColor: '#f5a623' }"
  >
    <Text class="switch-label"
      >OptionsApiChild — Options API, mixins + extends</Text
    >
    <Text class="note-text" testID="options-mixin-extends">{{
      `props.seed=${seed} · extends → extendedFlag=${extendedFlag} · mixins → mixinHit=${mixinHit}`
    }}</Text>
    <Text class="note-text" testID="options-instance-props">{{
      `mounted(): $refs.innerBox seen=${hasInnerRef} · $parent=${hasParent} · $root=${hasRoot} · $slots.default=${hasDefaultSlot}`
    }}</Text>
    <Text class="note-text">{{
      `$attrs (inheritAttrs:false) = ${JSON.stringify($attrs)}`
    }}</Text>
    <Text class="note-text">{{
      `app.config.globalProperties.$playgroundGreeting = ${$playgroundGreeting ?? 'not installed yet'}`
    }}</Text>
    <Text class="list-row-text" testID="options-count">{{
      `count=${count}`
    }}</Text>
    <ActionButton
      testID="options-bump"
      title="bump() → $emit('ping')"
      :onPress="bump"
      color="#f5a623"
    />
    <Text class="list-row-text" testID="options-external-ticks">{{
      `non-reactive external ticks (as last rendered)=${externalTicksSnapshot()}`
    }}</Text>
    <View class="row-tight">
      <ActionButton
        testID="options-mutate-external"
        title="mutate outside reactivity"
        :onPress="bumpExternal"
        color="#f5a623"
      />
      <ActionButton
        testID="options-force-update"
        title="$forceUpdate()"
        :onPress="forceRerender"
        color="#f5a623"
      />
    </View>
    <slot />
  </View>
</template>
