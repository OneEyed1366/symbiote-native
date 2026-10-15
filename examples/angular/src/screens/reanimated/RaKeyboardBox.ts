import { Component } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from '@symbiote-native/reanimated/angular';

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createLift() {
  const keyboard = useAnimatedKeyboard();

  const lift = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ translateY: -keyboard.height.value }] };
  });
  return { style: lift };
}

// A box that rides on top of the keyboard, whatever its height
@Component({
  selector: 'RaKeyboardBox',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `
    <view class="ra-stage">
      <view
        testID="ra-keyboard-box"
        class="ra-box"
        [symbioteHostProps]="lift"
      ></view>
      <text-input
        testID="ra-keyboard-input"
        class="ra-field"
        placeholder="focus me"
      ></text-input>
    </view>
  `,
})
export class RaKeyboardBox {
  readonly lift = createLift();
}
