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
      // The pressed look, as a `style` FUNCTION of press state — RN's own idiom. It briefly lived
      // in `.action-button:active` instead, because a functional style used to force this element
      // to stay a component and 146 instantiation sites ride on this one definition. That
      // constraint is GONE: `babel-lower-host-primitives` specialises the callback into
      // `style` + `activeStyle` at build time, so the idiom and the intrinsic tag stopped being a
      // trade-off — and pseudo-class state is now off in the parser, so the CSS route would
      // silently paint nothing.
      //
      // `props.color` is read INSIDE the callback, which is what keeps it reactive: the transform
      // emits the body once per state, so a colour captured outside would freeze at first render.
      style={({ pressed }: { pressed: boolean }) => ({
        borderColor: props.color,
        opacity: pressed ? 0.6 : 1,
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
