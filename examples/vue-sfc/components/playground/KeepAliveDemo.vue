<!--
  <KeepAlive> + onActivated/onDeactivated + <component :is> — no shipped screen has exercised any
  of these against a real Fabric tree before now (.docs/framework-api-surface/vue.md), so this
  demo IS the first real test, per the 2026-08-17 decision recorded there. KeepAlive's cache key is
  the resolved component's own identity, not props — three genuinely distinct component objects
  (TabA/TabB/TabC below) are switched by `:is`, not one component reused with different props, or
  KeepAlive would collapse them into a single cached slot.

  Each tab counts how many times IT ITSELF activates. With the cache ON, switching away and back
  leaves the count untouched (the instance was kept alive, just detached); with the cache OFF
  (plain `<component :is>`, no <KeepAlive> wrapper) the same switch destroys and recreates the
  tab, so its count resets to 0 every time — the toggle below makes that contrast visible instead
  of asserted.
-->
<script setup lang="ts">
import { ref, defineComponent, onActivated, onDeactivated, h } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

type ITabId = 'a' | 'b' | 'c';

function makeTab(id: ITabId, color: string) {
  return defineComponent({
    name: `KeepAliveTab${id.toUpperCase()}`,
    setup() {
      const activations = ref(0);
      const active = ref(false);
      onActivated(() => {
        activations.value += 1;
        active.value = true;
      });
      onDeactivated(() => {
        active.value = false;
      });
      return () =>
        h(
          View,
          { class: 'a11y-card', style: { borderWidth: 1, borderColor: color } },
          [
            h(Text, { class: 'switch-label' }, () => `Tab ${id.toUpperCase()}`),
            h(
              Text,
              { class: 'note-text' },
              () =>
                `activated ${activations.value} time(s) · currently ${active.value ? 'active' : 'mounted, not focused'}`,
            ),
          ],
        );
    },
  });
}

const TAB_COLOR = '#f5a623';
const tabs: Record<ITabId, ReturnType<typeof makeTab>> = {
  a: makeTab('a', TAB_COLOR),
  b: makeTab('b', TAB_COLOR),
  c: makeTab('c', TAB_COLOR),
};

const TAB_IDS: readonly ITabId[] = ['a', 'b', 'c'];
const activeTab = ref<ITabId>('a');
const cacheEnabled = ref(true);
</script>

<template>
  <View class="section-tight">
    <Text class="section-label"
      >&lt;KeepAlive&gt; + onActivated/onDeactivated + &lt;component
      :is&gt;</Text
    >
    <View class="row-tight">
      <ActionButton
        v-for="id in TAB_IDS"
        :key="id"
        :testID="`keepalive-tab-${id}`"
        :title="`Tab ${id.toUpperCase()}`"
        :onPress="() => (activeTab = id)"
        :color="TAB_COLOR"
      />
    </View>
    <ActionButton
      testID="keepalive-cache-toggle"
      :title="
        cacheEnabled ? 'Cache: ON (KeepAlive)' : 'Cache: OFF (plain switch)'
      "
      :onPress="() => (cacheEnabled = !cacheEnabled)"
      :color="TAB_COLOR"
    />
    <KeepAlive v-if="cacheEnabled" :max="3">
      <component :is="tabs[activeTab]" :key="activeTab" />
    </KeepAlive>
    <component :is="tabs[activeTab]" :key="activeTab" v-else />
  </View>
</template>
