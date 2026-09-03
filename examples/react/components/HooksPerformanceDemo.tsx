import {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { Text, TextInput, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

const WORDS = [
  'view',
  'text',
  'image',
  'scrollview',
  'pressable',
  'switch',
  'textinput',
  'flatlist',
  'modal',
  'activityindicator',
  'animated',
  'platform',
  'stylesheet',
  'safeareaview',
];

function busyWait(): void {
  // Deliberately busy for a moment so the deferred/transitioned path below has something real
  // to defer — a real app would filter a much larger dataset instead of spinning like this.
  for (let i = 0; i < 200_000; i += 1) {
    // idle on purpose
  }
}

function expensiveFilter(query: string): string[] {
  busyWait();
  return WORDS.filter(word => word.includes(query.toLowerCase()));
}

export function HooksPerformanceDemo() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;
  // useMemo: only re-runs the expensive filter when the DEFERRED query actually changes.
  const results = useMemo(
    () => expensiveFilter(deferredQuery),
    [deferredQuery],
  );

  const [reversed, setReversed] = useState(false);
  const [isPending, startReverseTransition] = useTransition();
  // useCallback: a stable handler identity — the shape a memoized child (MemoForwardRefDemo,
  // Built-in Components section) relies on to actually skip a re-render.
  const onToggleReverse = useCallback(() => {
    startReverseTransition(() => setReversed(current => !current));
  }, []);

  const ordered = reversed ? [...results].reverse() : results;

  return (
    <View className="section-nested">
      <Text className="section-label">
        useMemo · useCallback · useTransition · useDeferredValue
      </Text>
      <TextInput
        testID="hooks-perf-query"
        className="text-input"
        value={query}
        onValueChange={setQuery}
        placeholder="filter primitives…"
      />
      <Text testID="hooks-perf-results" className="info-text">
        {`showing ${ordered.length} of ${WORDS.length}${isStale ? ' (deferred value still catching up)' : ''}`}
      </Text>
      {ordered.map(word => (
        <Text key={word} className="list-row-text">
          {word}
        </Text>
      ))}
      <ActionButton
        testID="hooks-perf-reverse"
        title={isPending ? 'reversing…' : 'Reverse order (useTransition)'}
        onPress={onToggleReverse}
        color={LINE_COLOR.introspection}
      />
      <CaveatNote testID="hooks-perf-caveat">
        useTransition/useDeferredValue don't get real non-blocking scheduling
        here — render.ts hardcodes LegacyRoot, so both collapse onto the sync
        lane and flush immediately; isPending and "stale" above rarely stay
        observable for more than the same tick they change in.
      </CaveatNote>
    </View>
  );
}
