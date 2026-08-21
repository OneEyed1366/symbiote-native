<script setup lang="ts">
// Fixture, not a running component. The real vue-sfc corpus has no :global() and no
// <style module> block, so both scoping escape hatches were unsnapshotted.
const isLoud = false;
</script>

<template>
  <View class="card">
    <View class="card big" />
    <View :class="['card', isLoud && 'loud']" />
    <View class="legacy-reset" />
    <View :class="$style['module-card']" />
  </View>
</template>

<style scoped>
.card {
  padding: 10px;
}

/* Compound under scope: the key is suffixed once, the markup tokens each. */
.card.big {
  padding: 18px;
}

.loud {
  border-color: #ff3e00;
}

/* Escape hatch — registers unsuffixed and the markup token stays bare. */
:global(.legacy-reset) {
  margin: 0;
}
</style>

<style module>
.module-card {
  padding: 22px;
}
</style>
