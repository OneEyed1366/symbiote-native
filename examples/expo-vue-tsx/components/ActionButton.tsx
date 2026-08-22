import { defineComponent } from 'vue';
import { Pressable, Text } from '@symbiote-native/vue';

export type IActionButtonProps = {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
};

// Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) — a bare
// Button renders as unstyled tinted text on iOS, indistinguishable from a body Text line. One
// consistent bordered pill, tinted in the caller's own `color` exactly like Button already took,
// so per-screen color-coding is preserved and only the chrome becomes consistent. Reads `props.*`
// inside the render closure (not destructured at setup-time) so a later prop change stays
// reactive — Vue's twin of React re-rendering this component fresh on every parent render.
export const ActionButton = defineComponent<IActionButtonProps>(
  props => {
    return () => (
      <Pressable
        testID={props.testID}
        onPress={props.onPress}
        class="action-button"
        style={({ pressed }: { pressed: boolean }) => ({
          borderColor: props.color,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text class="action-button-text" style={{ color: props.color }}>
          {props.title}
        </Text>
      </Pressable>
    );
  },
  { name: 'ActionButton', props: ['title', 'onPress', 'color', 'testID'] },
);
