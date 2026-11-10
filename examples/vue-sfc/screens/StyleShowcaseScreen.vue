<!-- Seven standalone sheets on one screen, a panel per mechanism in `style-showcase/` -->
<script setup lang="ts">
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './StyleShowcase.css';
import './StyleShowcase.limits.css';
import './StyleShowcase.media.css';
import './showcase.scss';
import './showcase.less';
import './showcase.styl';
import AnimationPanel from './style-showcase/AnimationPanel.vue';
import CompoundPanel from './style-showcase/CompoundPanel.vue';
import DeclarationsPanel from './style-showcase/DeclarationsPanel.vue';
import LimitsPanel from './style-showcase/LimitsPanel.vue';
import MergePanel from './style-showcase/MergePanel.vue';
import ModulesPanel from './style-showcase/ModulesPanel.vue';
import PreprocessorsPanel from './style-showcase/PreprocessorsPanel.vue';
import SpecificityPanel from './style-showcase/SpecificityPanel.vue';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="style-showcase-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">
          {{ `${lineInfo.code} · ${lineInfo.label}` }}
        </text>
      </view>

      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.styling }"
        >
          <text class="hero-badge-text"> ST </text>
        </view>
        <view class="hero-copy">
          <text class="hero-title"> Styling showcase </text>
          <text class="hero-body">
            Seven stylesheets driving one screen — plain CSS, CSS Modules, SCSS,
            Less, Stylus, a sheet of things the compiler refuses and one for
            @media. Every tile is built so a dropped rule is visible rather than
            silent.
          </text>
        </view>
      </view>

      <DeclarationsPanel />
      <SpecificityPanel />
      <CompoundPanel />
      <MergePanel />
      <AnimationPanel />
      <ModulesPanel />
      <PreprocessorsPanel />
      <LimitsPanel />

      <view class="sc-panel">
        <text class="sc-panel-title"> 9 · @media — evaluated at runtime </text>
        <text class="sc-tile-label"> WINDOW WIDTH AND ORIENTATION </text>
        <view class="sc-media-tile" testID="sc-media-tile">
          <text class="sc-media-text">
            green from 600 wide · amber border in landscape
          </text>
        </view>
        <text class="sc-tile-caption">
          Rotate the device or resize the window: the tile repaints with no
          re-render. Dark mode and the reduced-motion setting flip the same way.
          Query the state from JS with matchMedia.
        </text>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
