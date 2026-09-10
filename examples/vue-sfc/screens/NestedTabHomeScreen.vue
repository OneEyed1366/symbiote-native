<!--
  This Tab is rendered AS the content of a root-Stack screen (NestedNavigatorsScreen.vue), so
  useNavigation() here resolves to the nested Tab's OWN handle, while getParent() walks exactly
  one hop up the NavigationScope chain to reach the ENCLOSING Stack's handle. Vue SFC twin of
  NestedNavigatorsScreen.tsx's inline NestedTabHomeScreen.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const navigation = useNavigation();
const parent = computed(() => navigation.value.getParent());
const canPopParent = computed(
  () => parent.value !== undefined && 'pop' in parent.value,
);
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];

function popParent(): void {
  const current = parent.value;
  if (current !== undefined && 'pop' in current) current.pop();
}
</script>

<template>
  <safe-area-view class="screen">
    <view class="section">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.structure }"
        >
          <text class="hero-badge-text">NN</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Nested navigators</text>
          <text class="hero-body"
            >A Tab navigator nested inside a Stack screen, reaching its parent's
            own navigation handle through getParent().</text
          >
        </view>
      </view>
      <text class="info-text">{{
        `parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`
      }}</text>
      <ActionButton
        testID="nested-pop-parent"
        title="Pop parent Stack (via getParent)"
        :onPress="popParent"
        :color="LINE_COLOR.structure"
      />
    </view>
  </safe-area-view>
</template>
