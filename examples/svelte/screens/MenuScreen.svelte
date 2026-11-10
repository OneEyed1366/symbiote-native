<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { MENU_SECTIONS } from '../menu-sections';
  import MenuRow from './MenuRow.svelte';

  // Root menu, one row per section, each pushes its hub screen with the section's stops
  const navigation = useStackNavigation();
</script>

<safe-area-view class="screen">
  <scroll-view testID="menu-scroll" class="screen">
    <view class="scroll-content">
      <view class="menu-hero">
        <text class="menu-eyebrow">SYMBIOTE NATIVE DEMO SUITE</text>
        <text class="menu-hero-title">Four sections to explore</text>
        <text class="menu-hero-subtitle">
          Framework covers primitives, Svelte APIs and CSS styling. Navigation
          drives @symbiote-native/navigation on a real native stack. Packages
          shows the companion libraries. Benchmarks times the engine's own
          commit path.
        </text>
      </view>
      {#each MENU_SECTIONS as section (section.key)}
        <MenuRow
          testID={`menu-row-${section.route}`}
          line={section.line}
          code={section.code}
          label={section.title}
          hint={section.hint}
          onPress={() => navigation.current.push(section.route)}
        />
      {/each}
    </view>
  </scroll-view>
</safe-area-view>
