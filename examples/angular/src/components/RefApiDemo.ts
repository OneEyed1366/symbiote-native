import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  findNodeHandle,
  type IHostInstance,
} from '@symbiote-native/angular';

// Static look lives in RefApiDemo.css, compiled at build time by @symbiote-native/css-parser.
import './RefApiDemo.css';

// @ViewChild on a template reference gives back Angular's own ElementRef, whose `nativeElement` IS
// the engine host node — the same node measure / setNativeProps / findNodeHandle run on, and no
// reactive-proxy wrapping to worry about the way Vue's shallowRef requirement forces.
//
// It used to name a `View` COMPONENT here. `<view>` is a tag covered by `SYMBIOTE_ELEMENTS` and
// nothing else is needed for it — the host components were a second mechanism on the same selector.

@Component({
  selector: 'RefApiDemo',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
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
        'measure · ' + frame
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
  // `ElementRef<IHostInstance>`, not `ElementRef<unknown>`: the imperative surface lives on the
  // engine's public instance, and an unknown `nativeElement` type-checks here and fails at every use.
  @ViewChild('boxRef') private boxRef?: ElementRef<IHostInstance>;

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
    // The two halves answer different questions and only one of them moves when you scroll, which
    // reads as a bug until the labels say so. `measure`'s x/y are the node's offset inside its
    // PARENT (`DOM.cpp`'s `originRelativeToParent`) — scrolling does not change that — while
    // pageX/pageY are measured from the root and do.
    box.measure((x, y, width, height, pageX, pageY) => {
      this.frame =
        `in parent x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
        ` · from root ${Math.round(pageX)},${Math.round(pageY)}`;
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
