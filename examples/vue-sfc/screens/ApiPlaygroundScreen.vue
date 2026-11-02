<!-- Vue's own template and Composition API surface running live under the Symbiote renderer -->
<script setup lang="ts">
import { ref, getCurrentInstance } from 'vue';
import GlobalApiDemo from '../components/playground/GlobalApiDemo.vue';
import OtherApiDemo from '../components/playground/OtherApiDemo.vue';
import BuiltInDemos from './api-playground/BuiltInDemos.vue';
import CommunicationDemos from './api-playground/CommunicationDemos.vue';
import CompositionDemos from './api-playground/CompositionDemos.vue';
import DirectiveDemos from './api-playground/DirectiveDemos.vue';
import HostRefDemos from './api-playground/HostRefDemos.vue';
import LifecycleDemos from './api-playground/LifecycleDemos.vue';
import ReactivityDemos from './api-playground/ReactivityDemos.vue';
import { ACCENT } from './api-playground/accent';
import { installGlobalApi } from './api-playground/global-api';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
const appHandlerLog = ref<string[]>([]);
const mixinMountLog = ref<string[]>([]);

// Installed from this setup so the mixin sees every child mounted below
const app = getCurrentInstance()?.appContext.app;
if (app) {
  installGlobalApi(app, {
    mixinMounts: mixinMountLog,
    appHandlers: appHandlerLog,
  });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="api-playground-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">
          {{ `${lineInfo.code} · ${lineInfo.label}` }}
        </text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: ACCENT }">
          <text class="hero-badge-text"> AP </text>
        </view>
        <view class="hero-copy">
          <text class="hero-title"> API Playground </text>
          <text class="hero-body">
            Vue's own template/Composition API surface, running live under
            Symbiote's renderer — not @symbiote-native/navigation this time.
          </text>
        </view>
      </view>

      <DirectiveDemos />
      <BuiltInDemos />
      <ReactivityDemos />
      <LifecycleDemos />
      <CompositionDemos />
      <HostRefDemos />
      <CommunicationDemos />

      <GlobalApiDemo />
      <view class="section-tight">
        <text class="section-label"> app.mixin() mount log </text>
        <text
          v-for="(entry, index) in mixinMountLog"
          :key="index"
          class="list-row-text"
        >
          {{ entry }}
        </text>
        <text class="section-label">
          app.config.errorHandler / warnHandler log
        </text>
        <text
          v-for="(entry, index) in appHandlerLog"
          :key="index"
          class="list-row-text"
        >
          {{ entry }}
        </text>
      </view>

      <OtherApiDemo />
    </scroll-view>
  </safe-area-view>
</template>
