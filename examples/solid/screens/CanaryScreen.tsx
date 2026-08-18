// The Solid canary surface. Every visual here is a real component off @symbiote-native/solid — no
// raw host intrinsics left. The screen exists to exercise what the headless tests cannot:
// fine-grained reactivity, native events coming back up, the responder/press lifecycle,
// native-owned scroll offset, the soft keyboard, and imperative commands that need a Fabric tag
// the coalesced commit only assigns a microtask later.
//
// FOUR TABS, not one scrolling screen, and that is forced rather than cosmetic: a FlatList or a
// SectionList nested inside a ScrollView loses its own virtualization (both scroll the same axis,
// so the list is handed an unbounded height and renders every row). RN warns about exactly this.
// Each tab therefore owns its scrolling container outright. The Animated tab is the one that
// cannot be judged by looking: Solid updates an animated leaf through setNativeProps without
// touching its reactive graph, so a JS-driven animation still looks smooth — only its Freeze JS
// button separates a real UI-thread animation from a JS one.
//
// SafeAreaView is this screen's root and stays outside the tabs. Its inset is padding, not a
// smaller frame, so its background still paints the full screen including the status-bar strip —
// and the pull-to-refresh spinner, which sits at a scroll container's top edge, lands below the
// notch instead of spinning invisibly behind it (device-observed 2026-08-18).
//
// Reached from MenuScreen's first row; it was the app root before the Stack navigator landed.

import { Show, createSignal } from 'solid-js';
import { Pressable, SafeAreaView, Text, View } from '@symbiote-native/solid';
import { AnimatedScreen } from './AnimatedScreen';
import { ControlsScreen } from './ControlsScreen';
import { ListScreen } from './ListScreen';
import { SectionsScreen } from './SectionsScreen';

type ITab = 'controls' | 'list' | 'sections' | 'animated';

const TABS: ReadonlyArray<{ id: ITab; label: string }> = [
  { id: 'controls', label: 'Controls' },
  { id: 'list', label: 'FlatList' },
  { id: 'sections', label: 'Sections' },
  { id: 'animated', label: 'Animated' },
];

export function CanaryScreen() {
  const [tab, setTab] = createSignal<ITab>('controls');

  return (
    <SafeAreaView class="screen">
      <View class="tabbar">
        {/* A plain map, not <For>: TABS is a module constant, so there is no list to keep in sync
            and <For>'s keyed bookkeeping would buy nothing. `Show` below IS imported explicitly —
            an un-imported control-flow name resolves against the renderer module and throws at
            runtime, not at build (.claude/rules/solid-descriptor-bridge.md §3). */}
        {TABS.map(entry => (
          <Pressable class="tab" onPress={() => setTab(entry.id)}>
            {() => (
              <Text class={tab() === entry.id ? 'tab-label-on' : 'tab-label'}>
                {entry.label}
              </Text>
            )}
          </Pressable>
        ))}
      </View>

      <Show when={tab() === 'controls'}>
        <ControlsScreen />
      </Show>
      <Show when={tab() === 'list'}>
        <ListScreen />
      </Show>
      <Show when={tab() === 'sections'}>
        <SectionsScreen />
      </Show>
      <Show when={tab() === 'animated'}>
        <AnimatedScreen />
      </Show>
    </SafeAreaView>
  );
}
