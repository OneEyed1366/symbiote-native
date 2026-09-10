import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ViewChild,
  inject,
} from '@angular/core';
import {
  ButtonElement,
  Text,
  View,
  findNodeHandle,
} from '@symbiote-native/angular';

// Static look lives in RefApiDemo.css, compiled at build time by @symbiote-native/css-parser.
import './RefApiDemo.css';

// @ViewChild gives back the real ViewHost component instance directly (no reactive-proxy
// wrapping to worry about, unlike Vue's shallowRef requirement) — its `nativeElement`
// getter (SymbiotePrimitiveHost) is the engine host node measure/setNativeProps run on.

@Component({
  selector: 'RefApiDemo',
  standalone: true,
  imports: [View, Text, ButtonElement],
  template: `
    <view class="section-nested">
      <text class="section-label"
        >Imperative ref · measure / setNativeProps / findNodeHandle</text
      >
      <view #boxRef testID="ref-box" class="ref-box">
        <text testID="ref-tag" class="ref-box-text">{{
          'native tag ' + (tag ?? '—')
        }}</text>
      </view>
      <text testID="measure-frame" class="info-text">{{
        'frame: ' + frame
      }}</text>
      <view class="row">
        <view class="flex-1">
          <button
            testID="measure-btn"
            title="Measure"
            (press)="onMeasure()"
            color="#dd0031"
          ></button>
        </view>
        <view class="flex-1">
          <button
            testID="flash-btn"
            title="Flash (setNativeProps)"
            (press)="onFlash()"
            color="#f6ad55"
          ></button>
        </view>
      </view>
    </view>
  `,
})
export class RefApiDemo implements AfterViewInit {
  @ViewChild('boxRef') private boxRef?: View;

  private readonly changeDetector = inject(ChangeDetectorRef);

  private flashed = false;
  frame = 'tap "Measure"';
  tag: number | null = null;

  ngAfterViewInit(): void {
    // The ViewChild is only populated by ngAfterViewInit (not ngOnInit), and the tag
    // itself exists only after the first commit — so this is the earliest safe read.
    // It runs outside a renderer-dispatched event, so the zoneless scheduler won't
    // pick up the `tag` write on its own; force it, mirroring App.ts's onRefresh().
    this.tag = findNodeHandle(this.boxRef?.nativeElement ?? null);
    this.changeDetector.detectChanges();
  }

  readonly onMeasure = (): void => {
    const box = this.boxRef?.nativeElement;
    if (box === undefined) return;
    box.measure((x, y, width, height, pageX, pageY) => {
      this.frame =
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
        ` · page ${Math.round(pageX)},${Math.round(pageY)}`;
    });
  };

  readonly onFlash = (): void => {
    const box = this.boxRef?.nativeElement;
    if (box === undefined) return;
    this.flashed = !this.flashed;
    box.setNativeProps({
      style: { backgroundColor: this.flashed ? '#f6ad55' : '#dd0031' },
    });
  };
}
