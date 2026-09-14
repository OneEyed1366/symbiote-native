<script lang="ts">
  // Header options demo: exercises headerLargeTitle, headerTintColor/headerStyle.backgroundColor,
  // a left bar button and a right bar-button MENU (both routed through setParams, see
  // header-options-screen-options.ts), and the full headerSearchBarOptions surface — every event
  // callback, plus the imperative SearchBarCommands ref driven by the buttons below (no need to
  // pull down manually to prove it). Svelte twin of
  // examples/vue-sfc/screens/HeaderOptionsScreen.vue.
  import { useRoute } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import { searchBarRef } from './header-options-screen-options';

  type IHeaderOptionsParams = {
    lastHeaderAction?: string;
    lastSearchText?: string;
    lastSearchSubmitted?: string;
    lastSearchBarEvent?: string;
  };

  function isHeaderOptionsParams(
    value: unknown,
  ): value is IHeaderOptionsParams {
    return typeof value === 'object' && value !== null;
  }

  const route = useRoute();
  const params = $derived<IHeaderOptionsParams>(
    isHeaderOptionsParams(route.current.params) ? route.current.params : {},
  );
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HeaderOptions];
</script>

<safe-area-view class="screen">
  <view class="section">
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view
        class="hero-badge"
        style={{ backgroundColor: LINE_COLOR.presentation }}
      >
        <text class="hero-badge-text">HD</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Header options</text>
        <text class="hero-body">
          Bar buttons, a right-side menu, a native search bar, and
          headerLargeTitle — every headerSearchBarOptions callback wired to a
          live control below.
        </text>
      </view>
    </view>
    <text class="info-text">
      headerLargeTitle · headerTintColor · headerStyle.backgroundColor
    </text>
    <text testID="header-last-action" class="info-text">
      {`last header action: ${params.lastHeaderAction ?? 'none yet — tap a bar button or menu item'}`}
    </text>
    <text testID="header-search-text" class="info-text">
      {`last search text: ${params.lastSearchText ?? 'none yet — pull down and type'}`}
    </text>
    <text testID="header-search-submitted" class="info-text">
      {`last search submitted: ${params.lastSearchSubmitted ?? 'none yet — type and press search'}`}
    </text>
    <text testID="header-search-event" class="info-text">
      {`last search bar event: ${params.lastSearchBarEvent ?? 'none yet — focus/blur/cancel the search bar'}`}
    </text>
    <text class="note-text">
      Pull down to reveal the search bar (headerSearchBarOptions), or use the
      buttons below to drive it imperatively through its SearchBarCommands ref.
    </text>
    <ActionButton
      testID="search-bar-focus"
      title="Focus search bar"
      onPress={() => searchBarRef.current?.focus()}
      color={LINE_COLOR.presentation}
    />
    <ActionButton
      testID="search-bar-set-text"
      title="Set text: preset value"
      onPress={() => searchBarRef.current?.setText('preset value')}
      color={LINE_COLOR.presentation}
    />
    <ActionButton
      testID="search-bar-clear"
      title="Clear search"
      onPress={() => searchBarRef.current?.clearText()}
      color={LINE_COLOR.presentation}
    />
    <ActionButton
      testID="search-bar-cancel"
      title="Cancel search"
      onPress={() => searchBarRef.current?.cancelSearch()}
      color={LINE_COLOR.presentation}
    />
  </view>
</safe-area-view>
