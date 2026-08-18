// Drop-in for RN's stock <Button>, matching examples/{react,vue-sfc,svelte}'s ActionButton: a bare
// Button paints as unstyled tinted text on iOS, indistinguishable from a body line. The caller's
// `color` tints only the chrome, so AnimatedDemo's JS-vs-native colour pairing survives.
//
// NOTHING here destructures `props` — a Solid component body runs ONCE, so a destructure would
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
      // A prop BAG, so reading press state here is safe: it reaches the host through `spread`,
      // a per-key diff on the same element (.claude/rules/solid-descriptor-bridge.md §4).
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
