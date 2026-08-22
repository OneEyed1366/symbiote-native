// Context — createContext · useContext.
//
// Context here is OWNER-tree lookup, not element-tree lookup, and that difference is what makes
// the "outside the provider" row below worth showing: the consumer is a sibling in the markup and
// gets the default value, while the one nested under the Provider gets the live signal. Both are
// mounted by the same component body.
//
// The context carries an ACCESSOR + setter, never a snapshot. A plain value would freeze at the
// moment the Provider was created — the body runs once, so there is no second pass to refresh it.

import { createContext, createSignal, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.structure;

type ITone = 'warm amber' | 'cool violet';
type IThemeContext = {
  tone: Accessor<ITone>;
  toggle: () => void;
};

const DEFAULT_THEME: IThemeContext = {
  tone: () => 'warm amber',
  toggle: () => undefined,
};

const ThemeContext = createContext<IThemeContext>(DEFAULT_THEME);

// Two levels down from the Provider, to show the lookup is not parent-only.
function ThemeLabel(props: { testID: string; caption: string }) {
  const theme = useContext(ThemeContext);
  return (
    <Text class="ap-value" testID={props.testID}>
      {`${props.caption}: ${theme.tone()}`}
    </Text>
  );
}

function ThemeCard(props: { testID: string; caption: string }) {
  return (
    <View class="ap-panel">
      <ThemeLabel testID={props.testID} caption={props.caption} />
    </View>
  );
}

// useContext reads the OWNER chain of the scope that calls it, so it has to be called in a
// component body — calling it from inside an onPress would run with no owner and silently hand
// back the context's default value.
function ToneToggle() {
  const theme = useContext(ThemeContext);
  return (
    <ActionButton
      testID="context-toggle"
      title="toggle tone (from inside)"
      color={ACCENT}
      onPress={() => theme.toggle()}
    />
  );
}

export function ContextDemo() {
  const [tone, setTone] = createSignal<ITone>('warm amber');
  const value: IThemeContext = {
    tone,
    toggle: () =>
      setTone(current =>
        current === 'warm amber' ? 'cool violet' : 'warm amber',
      ),
  };

  return (
    <View class="section-nested">
      <Text class="section-label">createContext · useContext</Text>
      <ThemeContext.Provider value={value}>
        <ThemeCard testID="context-inside" caption="inside the Provider" />
        <ToneToggle />
      </ThemeContext.Provider>
      <ThemeCard
        testID="context-outside"
        caption="outside the Provider (default value)"
      />
    </View>
  );
}
