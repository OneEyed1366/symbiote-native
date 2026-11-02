<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import { LINE_COLOR } from '../../navigation-lines';

const navigation = useStackNavigation();
const COLOR = LINE_COLOR.structure;
</script>

<template>
  <view class="nested-inner">
    <text class="section-label">Inner detail</text>
    <ActionButton
      testID="nested-inner-pop"
      title="Pop"
      :onPress="() => navigation.pop()"
      :color="COLOR"
    />
  </view>
</template>
