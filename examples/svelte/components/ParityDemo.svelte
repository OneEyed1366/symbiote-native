<script lang="ts">
  // Verification panel for five feature-parity behaviors: Text.onLongPress synthesis,
  // Keyboard.dismiss (blur the focused input), animated FlatList scroll, sticky SectionList
  // headers, and AccessibilityInfo.sendAccessibilityEvent. Port of
  // examples/react/components/ParityDemo.tsx.
  //
  // The panel title binds directly to the raw `symbiote-text` host tag, not the public `Text`
  // wrapper — Text.svelte forwards no `bind:this` escape hatch of its own (same reason
  // RefApiDemo's measured box hand-authors `symbiote-view` directly), so only a hand-authored
  // host tag hands back a real ShimElement `hostInstance()` can resolve into the
  // AccessibilityInfo.sendAccessibilityEvent target.
  //
  // section-nested's sibling group below is packed with zero whitespace between tags — see
  // svelte-adapter-dom-shim skill §16 (whitespace between sibling nodes becomes a real, invalid
  // text-node child of a non-Text host; a real bug already found this way in shipped code).
  import {
    View,
    Text,
    TextInput,
    FlatList,
    SectionList,
    Keyboard,
    AccessibilityInfo,
    hostInstance,
    type ShimElement,
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
  let titleRef = $state.raw<ShimElement | null>(null);
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

<View class="section-nested"
  ><symbiote-text p={{ class: 'section-label' }} bind:this={titleRef}
    >Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus</symbiote-text
  ><Text
    onLongPress={() => (longPressMsg = 'long press! (tap was suppressed)')}
    onPress={() => (longPressMsg = 'tap')}
    class="long-press-row">{longPressMsg}</Text
  ><TextInput
    placeholder="focus me…"
    placeholderTextColor="#41506a"
    onFocus={() => (dismissMsg = 'keyboard up — tap Hide keyboard')}
    onBlur={() => (dismissMsg = 'blurred (keyboard down)')}
    class="focus-input"
  /><Text class="note-text">{dismissMsg}</Text><ActionButton
    title="Hide keyboard"
    onPress={() => Keyboard.dismiss()}
    color="#7fb5ff"
  /><Text class="section-label">FlatList · animated scrollToOffset</Text
  ><FlatList
    bind:this={listRef}
    data={parityRows}
    keyExtractor={item => item.id}
    getItemLayout={(_data, index) => ({
      length: PARITY_ROW_H,
      offset: PARITY_ROW_H * index,
      index,
    })}
    class="parity-list"
    >{#snippet item({ item })}<View
        class="parity-row"
        style={{ height: PARITY_ROW_H }}
        ><Text class="info-text">{`row ${item.n}`}</Text></View
      >{/snippet}</FlatList
  ><View class="row"
    ><View class="flex1"
      ><ActionButton
        title="Scroll ▼ animated"
        onPress={() =>
          listRef?.scrollToOffset({
            offset: 20 * PARITY_ROW_H,
            animated: true,
          })}
        color="#7fb5ff"
      /></View
    ><View class="flex1"
      ><ActionButton
        title="Top · instant"
        onPress={() => listRef?.scrollToOffset({ offset: 0, animated: false })}
        color="#7fb5ff"
      /></View
    ></View
  ><Text class="section-label"
    >SectionList · sticky (scroll: next header should push prev off)</Text
  ><SectionList
    testID="sticky-section-list"
    sections={paritySections}
    keyExtractor={item => item.id}
    stickySectionHeadersEnabled
    class="section-list"
    >{#snippet sectionHeader({ section })}<Text class="section-header">{section.title}</Text>{/snippet}{#snippet item({ item })}<View
        class="parity-row"
        style={{ height: PARITY_ROW_H }}
        ><Text class="info-text">{item.label}</Text></View
      >{/snippet}</SectionList
  ><ActionButton
    title="Focus the panel title (a11y)"
    onPress={onFocusTitle}
    color="#7fb5ff"
  /></View
>
