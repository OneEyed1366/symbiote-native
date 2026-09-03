import { Component, createContext, useState, type ContextType } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IPlaygroundTheme = 'sunrise' | 'midnight';

// createContext(defaultValue) — the same primitive host-config.ts's own HostTransitionContext
// uses internally; this one is an ordinary app-level context.
const PlaygroundThemeContext = createContext<IPlaygroundTheme>('midnight');

// static contextType: the class-component way to read a SINGLE context via this.context,
// predating useContext — still the only option for a class component (no Hooks inside classes).
class ThemeReaderClass extends Component {
  static contextType = PlaygroundThemeContext;
  declare context: ContextType<typeof PlaygroundThemeContext>;

  render() {
    return (
      <Text testID="context-class-reader" className="info-text">
        {`class reader (static contextType): ${this.context}`}
      </Text>
    );
  }
}

export function ContextProviderDemo() {
  const [theme, setTheme] = useState<IPlaygroundTheme>('midnight');

  return (
    <View className="section-nested">
      <Text className="section-label">
        createContext · Context.Provider (React 19 direct render) · static
        contextType
      </Text>
      {/* React 19: a Context object can be rendered directly as its own provider — no
          `.Provider` suffix needed, though `.Provider` still works identically. */}
      <PlaygroundThemeContext value={theme}>
        <ThemeReaderClass />
      </PlaygroundThemeContext>
      <ActionButton
        testID="context-toggle-theme"
        title="Toggle theme"
        onPress={() =>
          setTheme(current => (current === 'midnight' ? 'sunrise' : 'midnight'))
        }
        color={LINE_COLOR.introspection}
      />
    </View>
  );
}
