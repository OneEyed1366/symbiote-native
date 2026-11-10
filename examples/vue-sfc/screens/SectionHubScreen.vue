<!-- One component serves the four hubs, the route name picks the section it lists -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/vue';
import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import MenuRow from './MenuRow.vue';

const route = useRoute();
const navigation = useStackNavigation();
const section = computed(() =>
  MENU_SECTIONS.find(candidate => candidate.route === route.value.name),
);
</script>

<template>
  <safe-area-view v-if="section" class="screen">
    <scroll-view :testID="`hub-scroll-${section.key}`" class="screen">
      <view class="scroll-content">
        <view class="menu-hero">
          <text class="menu-eyebrow">{{ section.title.toUpperCase() }}</text>
          <text class="menu-hero-subtitle">{{ section.hint }}</text>
        </view>
        <template v-for="group in sectionGroups(section)" :key="group.line ?? 'all'">
          <text v-if="group.line !== undefined" class="hub-group-title">
            {{ group.line.toUpperCase() }}
          </text>
          <MenuRow
            v-for="item in group.items"
            :key="item.route"
            :testID="`menu-row-${item.route}`"
            :line="ROUTE_LINE_INFO[item.route].line"
            :code="ROUTE_LINE_INFO[item.route].code"
            :label="item.label"
            :hint="item.hint"
            :onPress="() => navigation.push(item.route)"
          />
        </template>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
