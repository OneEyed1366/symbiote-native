<!-- Paints no background of its own, so the colour of the stack container shows through -->
<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import { LINE_COLOR } from '../../navigation-lines';

const navigation = useStackNavigation();
const COLOR = LINE_COLOR.structure;
</script>

<template>
  <view class="nested-inner">
    <text class="section-label">Inner stack</text>
    <ActionButton
      testID="nested-inner-push"
      title="Push detail"
      :onPress="() => navigation.push('InnerDetail')"
      :color="COLOR"
    />
  </view>
</template>
