// Drop-in for RN's stock <Button>: a bare Button renders as unstyled tinted text on iOS, so a
// bordered pill tinted by `color` replaces it. NOTHING here destructures `props` - a Solid
// component body runs ONCE, so a destructure would freeze the button at its mount-time config.

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
      style={state => ({
        borderColor: props.color,
        opacity: state.pressed ? 0.6 : 1,
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
