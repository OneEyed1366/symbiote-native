import { Pressable, StyleSheet, Text } from 'react-native';

type IActionButtonProps = {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
};

const PRESSED_OPACITY = 0.6;
const OPAQUE = 1;

// Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) —
// a bare Button renders as unstyled tinted text on iOS, visually indistinguishable from a body
// Text line. One consistent bordered pill, tinted in the caller's own `color` exactly like
// Button already took, so per-feature color-coding is preserved and only the chrome is shared.
export function ActionButton({
  title,
  onPress,
  color,
  testID,
}: IActionButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: color, opacity: pressed ? PRESSED_OPACITY : OPAQUE },
      ]}
    >
      <Text style={[styles.actionButtonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

// Ported one-for-one from the Symbiote canary's `.action-button` / `.action-button-text` CSS
// classes — stock RN has no className, so the same declarations live in a StyleSheet instead.
const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    backgroundColor: '#13243a',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
