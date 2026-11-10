<!-- A small tappable pill for the custom views of a native header -->
<script setup lang="ts">
defineProps<{
  testID: string;
  label: string;
  onPress: () => void;
}>();
</script>

<template>
  <pressable :testID="testID" class="header-view" @press="onPress">
    <text class="header-view-text">{{ label }}</text>
  </pressable>
</template>
