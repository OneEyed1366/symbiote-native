// THE STOCK ARM — the same tree, on the same device, driven by React Native's OWN Fabric renderer.
//
// WHY IT LIVES HERE AND NOT IN `examples/bare-rn`. The standing question is whether a tree-wide text
// re-measure is something this project's engine causes or something a Fabric commit costs whoever
// drives it, and RN's commit telemetry is only readable through a native binding. `bare-rn` is the
// stock baseline precisely because it carries no `@symbiote-native/*` dependency, so it cannot have
// that binding without ceasing to be what it is for. This app already has it.
//
// So the comparison moves here instead: one binary, one simulator, one row shape, and the ONLY
// difference between the arms is which renderer commits. Nothing about `bare-rn` changes.
//
// This screen is imported by `index.js` under a flag and is otherwise dead code — flip
// `STOCK_ARM` there and rebuild. It cannot be a runtime toggle: a rootTag belongs to one renderer,
// and handing a live one to a second renderer is not a measurement, it is a crash with numbers.
//
// Deliberately NOT a copy of `BenchmarkScreen`: it needs three operations, not eight, and every
// line it does not share is a line that cannot drift. What it DOES have to match exactly is the row
// — ten native views and the same strings — because the quantity under test is how many distinct
// text-measure cache keys the tree produces.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  readSurfaceTelemetry,
  type ISurfaceTelemetry,
} from '@symbiote-native/engine';
// The native bootsplash covers the window until someone hides it, and in the ordinary arm that
// someone is `App.tsx`. This arm routes around `App` entirely, so without this the screen mounts,
// commits, and is never seen — which reads as a hung build rather than a missing call.
import { hide } from '@symbiote-native/splash-screen/react';

// Verbatim from `BenchmarkScreen`, and it must stay verbatim: ~889 of 1 000 rows draw a distinct
// label from these lists, and that count IS the number of live cache keys the comparison is about.
const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'white',
  'black',
  'orange',
];
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];

const ROWS = 1000;

type IRow = { id: number; label: string };

let nextRowId = 1;

function pick(list: readonly string[]): string {
  return list[Math.round(Math.random() * 1000) % list.length];
}

function buildRows(count: number): IRow[] {
  const rows: IRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextRowId,
      label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
    };
    nextRowId += 1;
  }
  return rows;
}

const styles = StyleSheet.create({
  // A fixed inset rather than SafeAreaView or a provider: this arm has no navigator above it, and
  // the number it exists to print does not depend on being pretty. It does depend on the buttons
  // being tappable, which they are not under the notch.
  screen: { flex: 1, backgroundColor: '#0d1117', paddingTop: 64 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 },
  button: {
    borderWidth: 1,
    borderColor: '#e0a44c',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonText: { color: '#e0a44c' },
  readout: { color: '#9fb0c4', paddingHorizontal: 12, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  rowSelected: { backgroundColor: '#4a3a12' },
  id: { color: '#6f8199', width: 44 },
  label: { color: '#d7e2ee' },
  remove: { color: '#6f8199' },
  input: {
    backgroundColor: '#141b25',
    borderRadius: 6,
    color: '#d7e2ee',
    height: 28,
    paddingLeft: 8,
    paddingRight: 8,
    width: 120,
  },
  flex1: { flex: 1 },
});

// Ten native views, matching the adapter row one for one: three RCTView (this one plus two
// Pressables), three RCTText each with its RCTRawText, and one RCTSinglelineTextInputView.
function StockRow({
  row,
  isSelected,
  onSelect,
}: {
  row: IRow;
  isSelected: boolean;
  onSelect: (id: number) => void;
}): React.JSX.Element {
  return (
    <View style={isSelected ? [styles.row, styles.rowSelected] : styles.row}>
      <Text style={styles.id}>{String(row.id)}</Text>
      <Pressable style={styles.flex1} onPress={() => onSelect(row.id)}>
        <Text style={styles.label}>{row.label}</Text>
      </Pressable>
      <Pressable onPress={() => onSelect(row.id)}>
        <Text style={styles.remove}>×</Text>
      </Pressable>
      <TextInput style={styles.input} value={row.label} />
    </View>
  );
}

function formatTelemetry(reading: ISurfaceTelemetry | undefined): string {
  if (reading === undefined) {
    // Not zeroes. A pod without the binding and a commit that measured nothing are the two answers
    // this screen exists to tell apart, so they must not print the same.
    return 'no reading — the runtime carries no readSurfaceTelemetry binding';
  }
  return [
    `texts ${reading.textMeasures}`,
    `text ${reading.textMs.toFixed(1)} ms`,
    `layout ${reading.layoutMs.toFixed(1)} ms`,
    `nodes ${reading.layoutNodes}`,
  ].join(' · ');
}

// `rootTag` arrives as a prop because RN's own `renderApplication` passes it to the root component —
// the same tag the surface commits under, which is what the telemetry is keyed on.
export default function StockBenchmarkScreen({
  rootTag,
}: {
  rootTag: number;
}): React.JSX.Element {
  const [rows, setRows] = useState<IRow[]>([]);
  const [selected, setSelected] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const pendingRef = useRef<{ label: string; startedAt: number } | null>(null);

  useEffect(() => {
    hide();
  }, []);

  // React's own renderer reaches `completeRoot` inside `resetAfterCommit`, which runs before
  // layout effects — so by the time this fires the surface's current revision is the one this step
  // produced, and its telemetry is that commit's. Same definition of "done" the adapter screen uses.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    const durationMs = performance.now() - pending.startedAt;
    const reading = readSurfaceTelemetry(rootTag);
    setLines(previous =>
      [
        `${pending.label}  ${durationMs.toFixed(1)} ms  ${formatTelemetry(reading)}`,
        ...previous,
      ].slice(0, 8),
    );
  });

  const run = useCallback((label: string, mutate: () => void) => {
    pendingRef.current = { label, startedAt: performance.now() };
    mutate();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable
          style={styles.button}
          onPress={() => run('create', () => setRows(buildRows(ROWS)))}
        >
          <Text style={styles.buttonText}>Create 1,000</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() =>
            run('select', () => setSelected(previous => (previous === 2 ? 3 : 2)))
          }
        >
          <Text style={styles.buttonText}>Select row</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => run('clear', () => setRows([]))}
        >
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
      </View>
      {lines.map(line => (
        <Text key={line} style={styles.readout}>
          {line}
        </Text>
      ))}
      <ScrollView>
        {rows.map(row => (
          <StockRow
            key={row.id}
            row={row}
            isSelected={row.id === selected}
            onSelect={setSelected}
          />
        ))}
      </ScrollView>
    </View>
  );
}
