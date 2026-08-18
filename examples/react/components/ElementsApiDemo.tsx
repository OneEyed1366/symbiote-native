import { cloneElement, createElement, isValidElement, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

export function ElementsApiDemo() {
  const [color, setColor] = useState(LINE_COLOR.introspection);

  // createElement: the call JSX itself compiles to — building one by hand renders identically
  // to <Text className="info-text">built via createElement()</Text>.
  const built = createElement(
    Text,
    { className: 'info-text', testID: 'elements-created' },
    'built via createElement()',
  );
  // cloneElement: a new element based on `built`, with an overridden prop — the original stays
  // untouched (elements are immutable descriptions, not live nodes).
  const cloned = cloneElement(built, {
    style: { color },
    testID: 'elements-cloned',
  });
  const validBuilt = isValidElement(built);
  const validString = isValidElement('not an element');

  return (
    <View className="section-nested">
      <Text className="section-label">
        createElement · cloneElement · isValidElement
      </Text>
      {built}
      {cloned}
      <Text testID="elements-valid" className="info-text">
        {`isValidElement(built)=${String(validBuilt)} · isValidElement('string')=${String(validString)}`}
      </Text>
      <ActionButton
        testID="elements-recolor"
        title="Recolor the cloned element"
        onPress={() =>
          setColor(current =>
            current === LINE_COLOR.introspection
              ? LINE_COLOR.routing
              : LINE_COLOR.introspection,
          )
        }
        color={LINE_COLOR.introspection}
      />
      <Text className="note-text">
        props/children, the key prop, and onX event handling (onPress,
        onValueChange…) have no standalone demo here — they are the substrate
        this entire screen and app are built from; see any list's key prop
        below, or this very button's onPress handler.
      </Text>
    </View>
  );
}
