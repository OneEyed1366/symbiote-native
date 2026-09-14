<script lang="ts">
  // Verification panel for five feature-parity behaviors: Text.onLongPress synthesis,
  // Keyboard.dismiss (blur the focused input), animated FlatList scroll, sticky SectionList
  // headers, and AccessibilityInfo.sendAccessibilityEvent. Port of
  // examples/react/components/ParityDemo.tsx.
  //
  // `bind:this` on the title's host tag hands back a ShimElement, which `hostInstance()` resolves
  // into the engine node AccessibilityInfo.sendAccessibilityEvent takes as its target.
  import {
    FlatList,
    SectionList,
    Keyboard,
    AccessibilityInfo,
    hostInstance,
    type IFlatListHandle,
    type ISection,
  } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const PARITY_ROW_H = 30;
  const parityRows = Array.from({ length: 30 }, (_unused, index) => ({
    id: `pr-${index}`,
    n: index,
  }));
  // Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as you
  // scroll, the next section header should reach the top and PUSH the pinned one off.
  function sectionData(
    prefix: string,
    label: string,
  ): { id: string; label: string }[] {
    return Array.from({ length: 8 }, (_unused, index) => ({
      id: `${prefix}${index}`,
      label: `${label} ${index}`,
    }));
  }
  const paritySections: ISection<{ id: string; label: string }>[] = [
    { title: 'Fruit', data: sectionData('f', 'apple') },
    { title: 'Tools', data: sectionData('t', 'hammer') },
    { title: 'Cities', data: sectionData('c', 'porto') },
  ];

  let listRef = $state.raw<IFlatListHandle | null>(null);
  let titleRef = $state.raw<unknown>(null);
  let longPressMsg = $state('long-press or tap the row below');
  let dismissMsg = $state('focus the field, then Hide keyboard');

  // #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric slot on both
  // platforms (enable TalkBack/VoiceOver to feel the focus jump).
  function onFocusTitle(): void {
    const instance = hostInstance(titleRef);
    if (instance !== undefined)
      AccessibilityInfo.sendAccessibilityEvent(instance, 'focus');
  }
</script>

<view class="section-nested">
  <text class="section-label" bind:this={titleRef}>
    Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus
  </text>
  <text
    p={{
      onLongPress: () => (longPressMsg = 'long press! (tap was suppressed)'),
      onPress: () => (longPressMsg = 'tap'),
    }}
    class="long-press-row"
  >
    {longPressMsg}
  </text>
  <text-input
    placeholder="focus me…"
    placeholderTextColor="#41506a"
    p={{
      onFocus: () => (dismissMsg = 'keyboard up — tap Hide keyboard'),
      onBlur: () => (dismissMsg = 'blurred (keyboard down)'),
    }}
    class="focus-input"
  ></text-input>
  <text class="note-text">{dismissMsg}</text>
  <ActionButton
    title="Hide keyboard"
    onPress={() => Keyboard.dismiss()}
    color="#7fb5ff"
  />
  <text class="section-label">FlatList · animated scrollToOffset</text>
  <FlatList
    bind:this={listRef}
    data={parityRows}
    keyExtractor={item => item.id}
    getItemLayout={(_data, index) => ({
      length: PARITY_ROW_H,
      offset: PARITY_ROW_H * index,
      index,
    })}
    class="parity-list"
  >
    {#snippet item({ item })}
      <view class="parity-row" style={{ height: PARITY_ROW_H }}>
        <text class="info-text">{`row ${item.n}`}</text>
      </view>
    {/snippet}
  </FlatList>
  <view class="row">
    <view class="flex1">
      <ActionButton
        title="Scroll ▼ animated"
        onPress={() =>
          listRef?.scrollToOffset({
            offset: 20 * PARITY_ROW_H,
            animated: true,
          })}
        color="#7fb5ff"
      />
    </view>
    <view class="flex1">
      <ActionButton
        title="Top · instant"
        onPress={() => listRef?.scrollToOffset({ offset: 0, animated: false })}
        color="#7fb5ff"
      />
    </view>
  </view>
  <text class="section-label">
    SectionList · sticky (scroll: next header should push prev off)
  </text>
  <SectionList
    testID="sticky-section-list"
    sections={paritySections}
    keyExtractor={item => item.id}
    stickySectionHeadersEnabled
    class="section-list"
  >
    {#snippet sectionHeader({ section })}
      <text class="section-header">{section.title}</text>
    {/snippet}
    {#snippet item({ item })}
      <view class="parity-row" style={{ height: PARITY_ROW_H }}>
        <text class="info-text">{item.label}</text>
      </view>
    {/snippet}
  </SectionList>
  <ActionButton
    title="Focus the panel title (a11y)"
    onPress={onFocusTitle}
    color="#7fb5ff"
  />
</view>
