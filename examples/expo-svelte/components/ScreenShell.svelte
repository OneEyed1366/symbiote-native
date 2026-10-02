<script lang="ts">
  import type { Snippet } from 'svelte';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import type { ITourRouteName } from '../navigation-lines';

  // Line tag + hero card + scroll container shared by every demo screen
  let {
    route,
    title,
    body,
    testID,
    children,
  }: {
    route: ITourRouteName;
    title: string;
    body: string;
    testID: string;
    children: Snippet;
  } = $props();

  const lineInfo = $derived(ROUTE_LINE_INFO[route]);
</script>

<safe-area-view class="screen">
  <scroll-view {testID} class="screen" contentContainerStyle="scroll-content">
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
    </view>
    <view class="hero-card">
      <view
        class="hero-badge"
        style={{ backgroundColor: LINE_COLOR[lineInfo.line] }}
      >
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">{title}</text>
        <text class="hero-body">{body}</text>
      </view>
    </view>
    {@render children()}
  </scroll-view>
</safe-area-view>
