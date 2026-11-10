<script setup lang="ts">
import CounterWatchDemo from '../../components/playground/CounterWatchDemo.vue';
import ShallowRefDemo from '../../components/playground/ShallowRefDemo.vue';
import CustomRefDebounceDemo from '../../components/playground/CustomRefDebounceDemo.vue';
import ToRefsDemo from '../../components/playground/ToRefsDemo.vue';
import EffectScopeDemo from '../../components/playground/EffectScopeDemo.vue';
import ReactivityChecksDemo from '../../components/playground/ReactivityChecksDemo.vue';
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Reactivity API </text>
    <CounterWatchDemo />
    <ShallowRefDemo />
    <CustomRefDebounceDemo />
    <ToRefsDemo />
    <EffectScopeDemo />
    <ReactivityChecksDemo />
  </view>
</template>
