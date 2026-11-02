<script lang="ts">
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import type { ITourRouteName } from '../navigation-lines';

  type IScreenHeroProps = {
    route: ITourRouteName;
    title: string;
    body: string;
  };

  // Line tag and intro card every demo screen leads with, tinted by the screen's own line
  let { route, title, body }: IScreenHeroProps = $props();
  const info = $derived(ROUTE_LINE_INFO[route]);
</script>

<view class={`line-tag line-tag-${info.line}`}>
  <text class="line-tag-text">{`${info.code} · ${info.label}`}</text>
</view>
<view class="hero-card">
  <view class="hero-badge" style={{ backgroundColor: LINE_COLOR[info.line] }}>
    <text class="hero-badge-text">{info.code}</text>
  </view>
  <view class="hero-copy">
    <text class="hero-title">{title}</text>
    <text class="hero-body">{body}</text>
  </view>
</view>
