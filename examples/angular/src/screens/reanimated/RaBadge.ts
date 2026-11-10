import { Component, ViewChild, type AfterViewInit } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  getViewProp,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from '@symbiote-native/reanimated/angular';

const GROWN = 1.4;
const SMALL = 1;

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createGrow() {
  const scale = useSharedValue<number>(SMALL);
  const grow = useAnimatedStyle(() => {
    'worklet';
    return { transform: [{ scale: scale.value }] };
  });
  const toggle = () => {
    scale.value = withSpring(scale.value === SMALL ? GROWN : SMALL);
  };
  return { toggle, props: { style: grow } };
}

// A component of ours that draws one tile and animates it, which the section uses as it is
@Component({
  selector: 'RaBadge',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, SymbioteHostPropsDirective],
  template: `<view
    class="ra-tile ra-tile-small"
    [symbioteHostProps]="grow.props"
  ></view>`,
})
export class RaBadge implements AfterViewInit {
  readonly grow = createGrow();
  private readonly badgeRef = useAnimatedRef();

  @ViewChild(SymbioteHostPropsDirective)
  private view?: SymbioteHostPropsDirective;

  // The ref is told which node the tile is, once the view is there
  ngAfterViewInit(): void {
    this.badgeRef(this.view?.node);
  }

  toggle(): void {
    this.grow.toggle();
  }

  async readOpacity(): Promise<string> {
    const tag = this.badgeRef.getTag();
    if (tag === null) return 'unread';
    const read = await getViewProp<number>(
      tag,
      'opacity',
      this.badgeRef.current,
    );
    return String(read);
  }
}
