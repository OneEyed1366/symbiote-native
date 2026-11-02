<script lang="ts">
  import {
    useRoute,
    useStackNavigation,
  } from '@symbiote-native/navigation/svelte';
  import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
  import { ROUTE_LINE_INFO } from '../navigation-lines';
  import MenuRow from './MenuRow.svelte';

  // One component serves the four hubs, a screen gets no props so the route name picks the section
  const route = useRoute();
  const navigation = useStackNavigation();
  const section = $derived(
    MENU_SECTIONS.find(candidate => candidate.route === route.current.name),
  );
</script>

{#if section}
  <safe-area-view class="screen">
    <scroll-view testID={`hub-scroll-${section.key}`} class="screen">
      <view class="scroll-content">
        <view class="menu-hero">
          <text class="menu-eyebrow">{section.title.toUpperCase()}</text>
          <text class="menu-hero-subtitle">{section.hint}</text>
        </view>
        {#each sectionGroups(section) as group (group.line ?? 'all')}
          {#if group.line}
            <text class="hub-group-title">{group.line.toUpperCase()}</text>
          {/if}
          {#each group.items as item (item.route)}
            {@const lineInfo = ROUTE_LINE_INFO[item.route]}
            <MenuRow
              testID={`menu-row-${item.route}`}
              line={lineInfo.line}
              code={lineInfo.code}
              label={item.label}
              hint={item.hint}
              onPress={() => navigation.current.push(item.route)}
            />
          {/each}
        {/each}
      </view>
    </scroll-view>
  </safe-area-view>
{/if}
