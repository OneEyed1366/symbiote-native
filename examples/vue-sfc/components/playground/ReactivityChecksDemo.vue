<!--
  The reactivity-API rows that are fundamentally PREDICATE/normalization functions rather than
  standalone widgets (reactive/shallowReactive/readonly/shallowReadonly/toRaw/markRaw/isReactive/
  isReadonly/isProxy/isShallow/isRef/unref/toValue) — computed once and rendered as a plain check
  list, per the "no standalone UI needed" allowance for type-only/structural rows. The one
  INTERACTIVE control (bump deep.n) proves reactive() itself is genuinely live, so the surrounding
  static checks aren't the only thing on screen. readonly()'s mutation-blocking behavior is
  described, not attempted — forcing a write through TS's DeepReadonly<T> would need a
  `@ts-expect-error` escape hatch in app code for a Vue-dev-warning-only effect, not worth it here.
-->
<script setup lang="ts">
import {
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  toRaw,
  markRaw,
  isReactive,
  isReadonly,
  isProxy,
  isShallow,
  isRef,
  unref,
  toValue,
  ref,
  computed,
  type MaybeRefOrGetter,
} from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

const deep = reactive({ n: 0 });
const shallow = shallowReactive({ n: 0 });
const ro = readonly(deep);
const shallowRo = shallowReadonly(shallow);
const raw = markRaw({ n: 1 });
const wrappedRaw = reactive({ inner: raw });

const plainRef = ref(5);
const notARef = 5;

function useDoubled(source: MaybeRefOrGetter<number>) {
  return computed(() => toValue(source) * 2);
}
const fromNumber = useDoubled(3);
const fromRef = useDoubled(ref(4));
const fromGetter = useDoubled(() => 5);

const checks = computed(() => [
  `isReactive(reactive())=${isReactive(deep)} · isReactive(shallowReactive())=${isReactive(shallow)}`,
  `isReadonly(readonly())=${isReadonly(ro)} · isReadonly(shallowReadonly())=${isReadonly(shallowRo)}`,
  `isProxy(reactive())=${isProxy(deep)} · isProxy(plain object)=${isProxy({})}`,
  `isShallow(shallowReactive())=${isShallow(shallow)} · isShallow(reactive())=${isShallow(deep)}`,
  `toRaw(reactive()).n === deep.n: ${toRaw(deep).n === deep.n} (same underlying value, no proxy)`,
  `markRaw: isReactive(reactive({inner: markRaw({})}).inner)=${isReactive(wrappedRaw.inner)} (sticks through reactive())`,
  `isRef(ref())=${isRef(plainRef)} · isRef(5)=${isRef(notARef)}`,
  `unref(ref(5))=${unref(plainRef)} · unref(5)=${unref(notARef)}`,
  `toValue(number)=${fromNumber.value} · toValue(ref)=${fromRef.value} · toValue(getter)=${fromGetter.value}`,
]);

function bumpDeep(): void {
  deep.n += 1;
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label"
      >reactive/shallowReactive/readonly/shallowReadonly/toRaw/markRaw +
      predicates</Text
    >
    <Text class="list-row-text" testID="checks-deep-n">{{
      `reactive({n}).n = ${deep.n} (live)`
    }}</Text>
    <ActionButton
      testID="checks-bump-deep"
      title="deep.n++"
      :onPress="bumpDeep"
      color="#f5a623"
    />
    <Text class="note-text"
      >readonly()'s block isn't demoed interactively — mutating it would need
      TypeScript's DeepReadonly&lt;T&gt; suppressed just for this button, not
      worth adding to app code.</Text
    >
    <Text v-for="(entry, index) in checks" :key="index" class="list-row-text">{{
      entry
    }}</Text>
  </View>
</template>
