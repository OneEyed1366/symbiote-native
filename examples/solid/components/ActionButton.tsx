// Drop-in for RN's stock <Button>, matching examples/{react,vue-sfc,svelte}'s ActionButton: a bare
// Button paints as unstyled tinted text on iOS, indistinguishable from a body line. The caller's
// `color` tints only the chrome, so AnimatedDemo's JS-vs-native colour pairing survives.
//
// NOTHING here destructures `props` — a Solid component body runs ONCE, so a destructure would
// freeze the button at its mount-time config.

interface IActionButtonProps {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
}

export function ActionButton(props: IActionButtonProps) {
  return (
    <pressable
      testID={props.testID}
      onPress={() => props.onPress()}
      class="action-button"
      // The pressed look, as a `style` FUNCTION of press state — RN's own idiom, resolved by the
      // engine at both values of `pressed` (`isStyleCallback`, `core/engine/src/node.ts`) whether
      // or not anything reads press state elsewhere.
      //
      // `props.color` is read INSIDE the callback, which is what keeps it reactive: the engine
      // calls the body once per state, so a colour captured outside would freeze at first render.
      style={({ pressed }: { pressed: boolean }) => ({
        borderColor: props.color,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {() => (
        <text class="action-button-text" style={{ color: props.color }}>
          {props.title}
        </text>
      )}
    </pressable>
  );
}
