// Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) -
// a bare Button renders as unstyled tinted text on iOS, visually indistinguishable from a body
// Text line, which was the single biggest source of "looks messy" across the demo app (2026-07
// cohesion pass). One consistent bordered pill, tinted in the caller's own `color` exactly like
// Button already took, so each screen's own line color is preserved - only the chrome becomes
// consistent.
//
// NOTHING here destructures `props` - a Solid component body runs ONCE, so a destructure would
// freeze the button at its mount-time config.

import { Pressable, Text } from '@symbiote-native/solid';

interface IActionButtonProps {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
}

export function ActionButton(props: IActionButtonProps) {
  return (
    <Pressable
      testID={props.testID}
      onPress={() => props.onPress()}
      class="action-button"
      style={state => ({
        borderColor: props.color,
        opacity: state.pressed ? 0.6 : 1,
      })}
    >
      {() => (
        <Text class="action-button-text" style={{ color: props.color }}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}
