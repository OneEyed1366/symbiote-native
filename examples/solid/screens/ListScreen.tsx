// Wave 4, part 1: FlatList. What a real host proves that the headless fake cannot —
//   * virtualization: only a window of rows is committed, and it slides as native scrolls;
//   * numColumns: the auto-generated row View is a real Yoga flex-row, not a described one;
//   * onEndReached: fired off a native scroll event, deduped, re-armed after the data grows;
//   * viewability: which rows count as visible is measured by native layout, not asserted;
//   * the imperative handle: scrollToIndex resolves against ROWS in the multi-column branch.
//
// renderItem takes an ACCESSOR here, unlike React/Vue/Svelte. Calling it inside the leaf is the
// point: this function runs once, and Solid's `insert` replaces a subtree rather than diffing it,
// so a snapshot would rebuild the whole cell on every update (.claude/rules/solid-descriptor-bridge.md §4).

import { createSignal } from 'solid-js';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type IFlatListHandle,
} from '@symbiote-native/solid';
import { ListDiagnostics } from './ListDiagnostics';

interface ITile {
  key: string;
  label: string;
  hue: string;
}

const HUES = ['#1b2440', '#20304f', '#26385c', '#2c4068'];
const PAGE = 24;
const REFRESH_MS = 1_200;

const makeTiles = (from: number, count: number): ITile[] =>
  Array.from({ length: count }, (_unused, offset) => {
    const n = from + offset;
    return { key: `tile-${n}`, label: `#${n}`, hue: HUES[n % HUES.length] };
  });

export function ListScreen() {
  const [tiles, setTiles] = createSignal<ITile[]>(makeTiles(0, PAGE));
  const [refreshing, setRefreshing] = createSignal(false);
  const [visible, setVisible] = createSignal<string[]>([]);
  const [endHits, setEndHits] = createSignal(0);

  let list: IFlatListHandle | undefined;

  const refresh = (): void => {
    setRefreshing(true);
    setTimeout(() => {
      setTiles(makeTiles(0, PAGE));
      setEndHits(0);
      setRefreshing(false);
    }, REFRESH_MS);
  };

  // Appending on onEndReached is the honest test of the re-arm: the callback must fire once per
  // approach to the end, not once per scroll event, and must arm again once the data has grown.
  const appendPage = (): void => {
    setEndHits(hits => hits + 1);
    setTiles(current => [...current, ...makeTiles(current.length, PAGE)]);
  };

  return (
    <View class="screen-body">
      <View class="toolbar">
        <Pressable
          class="chip"
          onPress={() => list?.scrollToOffset({ offset: 0, animated: true })}
        >
          {() => <Text class="chip-label">Top</Text>}
        </Pressable>
        {/* scrollToIndex on a multi-column list resolves against ROWS, so index 10 is the 11th
            ROW — the 21st and 22nd tiles. Deliberately well inside the data: an out-of-range
            index now throws RN's invariant rather than clamping. */}
        <Pressable
          class="chip"
          onPress={() => list?.scrollToIndex({ index: 10, animated: true })}
        >
          {() => <Text class="chip-label">Row 10</Text>}
        </Pressable>
        <Pressable
          class="chip"
          onPress={() => list?.scrollToEnd({ animated: true })}
        >
          {() => <Text class="chip-label">End</Text>}
        </Pressable>
      </View>

      <View class="readout">
        <Text class="row-label">
          {tiles().length} tiles · onEndReached ×{endHits()}
        </Text>
        <Text class="row-label">
          visible: {visible().length === 0 ? '—' : visible().join(' ')}
        </Text>
      </View>

      <ListDiagnostics />

      <FlatList<ITile>
        class="scroll"
        contentContainerStyle="grid"
        data={tiles()}
        numColumns={2}
        columnWrapperStyle="grid-row"
        keyExtractor={tile => tile.key}
        initialNumToRender={8}
        windowSize={3}
        onEndReached={appendPage}
        onEndReachedThreshold={0.4}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onViewableItemsChanged={info =>
          setVisible(info.viewableItems.map(token => `#${token.index}`))
        }
        /* The list builds its own RefreshControl from these two, rather than taking a ready-made
           element the way ScrollView does — WHERE it goes is platform-specific (a sibling of the
           scroll host on iOS, a wrapper around it on Android), and that branch belongs to the
           component, not the caller. Same surface RN's VirtualizedList exposes. */
        refreshing={refreshing()}
        onRefresh={refresh}
        renderItem={info => (
          <View class="tile" style={{ backgroundColor: info().item.hue }}>
            <Text class="tile-label">{info().item.label}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View class="card">
            <Text class="section">FlatList · two columns</Text>
            <Text class="subtitle">
              Scroll to the bottom and the list appends another page. Pull down
              to reset it.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View class="footer">
            <Text class="row-label">end of the loaded pages</Text>
          </View>
        }
      />
    </View>
  );
}
