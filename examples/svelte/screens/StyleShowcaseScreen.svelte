<script lang="ts">
  // One screen over seven sheets, one panel per mechanism, kept in `style-showcase/`
  // The sheets are standalone files, not a `<style>` block, since a Svelte block is scoped per file
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import './StyleShowcase.css';
  import './StyleShowcase.limits.css';
  import './StyleShowcase.media.css';
  import './StyleShowcase.lab.css';
  import './showcase.scss';
  import './showcase.less';
  import './showcase.styl';
  import AnimationPanel from './style-showcase/AnimationPanel.svelte';
  import CompoundPanel from './style-showcase/CompoundPanel.svelte';
  import ContainerLab from './style-showcase/ContainerLab.svelte';
  import MediaLab from './style-showcase/MediaLab.svelte';
  import VarLab from './style-showcase/VarLab.svelte';
  import DeclarationsPanel from './style-showcase/DeclarationsPanel.svelte';
  import LimitsPanel from './style-showcase/LimitsPanel.svelte';
  import MediaPanel from './style-showcase/MediaPanel.svelte';
  import MergePanel from './style-showcase/MergePanel.svelte';
  import ModulesPanel from './style-showcase/ModulesPanel.svelte';
  import PreprocessorsPanel from './style-showcase/PreprocessorsPanel.svelte';
  import SpecificityPanel from './style-showcase/SpecificityPanel.svelte';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StyleShowcase];
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="style-showcase-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>

    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: LINE_COLOR.styling }}>
        <text class="hero-badge-text">ST</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Styling showcase</text>
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
    <MediaPanel />
    <MediaLab />
    <ContainerLab />
    <VarLab />
  </scroll-view>
</safe-area-view>
