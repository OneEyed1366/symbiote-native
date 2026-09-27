type IActionButtonProps = {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
};

// Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) — a bare
// Button renders as unstyled tinted text on iOS, indistinguishable from body text. One consistent
// bordered pill, tinted by the caller's own `color`, keeps each screen's color-coding intact.
export function ActionButton({
  title,
  onPress,
  color,
  testID,
}: IActionButtonProps) {
  return (
    <pressable
      testID={testID}
      onPress={onPress}
      className="action-button"
      style={({ pressed }) => ({
        borderColor: color,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <text className="action-button-text" style={{ color }}>
        {title}
      </text>
    </pressable>
  );
}
