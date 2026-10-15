import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  type AfterViewInit,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  dispatchCommand,
  measure,
  setNativeProps,
  useAnimatedRef,
} from '@symbiote-native/reanimated/angular';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createMeasure(setMeasured: (text: string) => void) {
  const boxRef = useAnimatedRef();
  const fieldRef = useAnimatedRef();

  const onMeasure = () => {
    scheduleOnUI(() => {
      'worklet';
      const size = measure(boxRef);
      scheduleOnRN(
        setMeasured,
        size === null
          ? 'measure returned null'
          : `${Math.round(size.width)} x ${Math.round(size.height)} at ${Math.round(size.pageX)}, ${Math.round(size.pageY)}`,
      );
    });
  };

  const onWrite = () => {
    scheduleOnUI(() => {
      'worklet';
      setNativeProps(fieldRef, { text: 'written from the UI thread' });
    });
  };

  const onFocus = () => {
    scheduleOnUI(() => {
      'worklet';
      dispatchCommand(fieldRef, 'focus');
    });
  };

  return { boxRef, fieldRef, onMeasure, onWrite, onFocus };
}

// Animated refs reach a view from the UI thread: measure it, write a prop to it and send it a
// command, all without a render on the JS side
@Component({
  selector: 'RaMeasure',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Measure and refs</text>
      <text class="ra-note"
        >useAnimatedRef with measure, setNativeProps and dispatchCommand</text
      >
      <view #box testID="ra-measure-box" class="ra-box"></view>
      <text class="ra-note">{{ measured() }}</text>
      <text-input
        #field
        testID="ra-measure-field"
        class="ra-field"
        placeholder="a field the UI thread writes to"
      ></text-input>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-measure-run"
          title="measure"
          [color]="accent"
          (press)="runs.onMeasure()"
        />
        <ActionButton
          testID="ra-measure-write"
          title="write text"
          [color]="accent"
          (press)="runs.onWrite()"
        />
        <ActionButton
          testID="ra-measure-focus"
          title="focus"
          [color]="accent"
          (press)="runs.onFocus()"
        />
      </view>
    </view>
  `,
})
export class RaMeasure implements AfterViewInit {
  readonly measured = signal('not measured yet');
  readonly runs = createMeasure(text => this.measured.set(text));
  readonly accent = ACCENT;

  @ViewChild('box') private box?: ElementRef<unknown>;
  @ViewChild('field') private field?: ElementRef<unknown>;

  // A template reference gives the element, whose native element is the node the refs want
  ngAfterViewInit(): void {
    this.runs.boxRef(this.box?.nativeElement);
    this.runs.fieldRef(this.field?.nativeElement);
  }
}
