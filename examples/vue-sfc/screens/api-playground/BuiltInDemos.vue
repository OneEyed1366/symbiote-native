<script setup lang="ts">
import KeepAliveDemo from '../../components/playground/KeepAliveDemo.vue';
import SuspenseDemo from '../../components/playground/SuspenseDemo.vue';
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Built-in Components </text>
    <KeepAliveDemo />
    <SuspenseDemo />
    <text class="note-text">
      &lt;component :is&gt; is exercised above, inside &lt;KeepAlive&gt;.
      &lt;slot&gt; + &lt;template&gt; are exercised throughout this screen (every
      `#name` slot below, every grouped &lt;template v-if&gt; above).
      &lt;Teleport&gt; already has a live demo on CanaryScreen.vue ("Show toast
      (Teleport)") — not re-demoed here.
    </text>
  </view>
</template>
