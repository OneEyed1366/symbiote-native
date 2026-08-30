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
      // The press half moved to `.action-button:active` in App.css. A FUNCTIONAL style is the one
      // thing that forces this element to stay a component — the template would have to read the
      // press state — so dropping it is what makes the button eligible for the intrinsic tag, and
      // 146 instantiation sites ride on this one definition.
      //
      // Still reactive without the function: Solid compiles a dynamic object attribute on a
      // component into `get style() { return {borderColor: props.color}; }`, so `color` is re-read
      // on change. Verified in the compiled output, not assumed.
      style={{ borderColor: props.color }}
    >
      {() => (
        <Text class="action-button-text" style={{ color: props.color }}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}
