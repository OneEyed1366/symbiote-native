import {
  Component,
  EventEmitter,
  Input,
  Output,
  type AfterContentChecked,
  type AfterContentInit,
  type AfterViewChecked,
  type AfterViewInit,
  type DoCheck,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// Every lifecycle hook, in the order Angular actually calls them, each emitting one log line the
// parent renders in an @for list. `tick` is a plain @Input (not `style`/`class`), so it propagates
// and dirties this view normally - none of the angular-adapter-change-detection §13 gotcha
// applies here. Projected content (<ng-content>) is what gives ngAfterContentInit/Checked
// something real to fire for.
//
// THE THREE `*Checked` HOOKS REPORT ONCE, and that is a correctness requirement rather than a
// tidy-up. They run on EVERY change-detection pass, and a template listener is wrapped in
// `wrapListenerIn_markDirtyAndPreventDefault`, which dirties the view it is bound in - so emitting
// a BOUND @Output from one of them re-dirties the parent forever and Angular gives up with NG0103
// after MAXIMUM_REFRESH_RERUNS. Writing the handler's result into a signal the parent's template
// reads does the same thing a second way.
//
// Device-diagnosed 2026-09-20: this screen ran on a permanent NG0103, quietly, because a scheduler
// tick catches it and hands it to `ErrorHandler`. The first keystroke in the `[(ngModel)]` field
// took the same throw through the adapter's synchronous read-back flush, which runs outside that
// handler, and killed the app - `RCTFatalException: Unhandled JS Exception: Error: NG0103`, with no
// redbox because Release has none. The adapter's half of that is fixed separately; a component
// that cannot be change-detected is this file's half.
//
// Reporting once loses nothing the log was for: what it shows is the hook ORDER. That these three
// keep running afterwards is shown by COUNTERS in a plain field instead - a plain field dirties
// nothing, so the numbers below are simply as of the last pass anything else rendered, which is
// the honest reading of "this ran again".
@Component({
  selector: 'PlaygroundLifecycleLogger',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="pg-lifecycle-box" testID="pg-lifecycle-box">
      <ng-content></ng-content>
      <text testID="pg-lifecycle-checks" class="rstyle-caption">{{
        checkedReadout
      }}</text>
    </view>
  `,
})
export class PlaygroundLifecycleLogger
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  @Input() tick = 0;
  @Output() readonly hookFired = new EventEmitter<string>();

  // Insertion-ordered, so the readout keeps the order Angular calls them in.
  private readonly checkCounts = new Map<string, number>();

  constructor() {
    this.hookFired.emit('constructor');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('tick' in changes)
      this.hookFired.emit(`ngOnChanges(tick=${this.tick})`);
  }

  ngOnInit(): void {
    this.hookFired.emit('ngOnInit');
  }

  ngDoCheck(): void {
    this.reportRepeatingHook('ngDoCheck');
  }

  ngAfterContentInit(): void {
    this.hookFired.emit('ngAfterContentInit');
  }

  ngAfterContentChecked(): void {
    this.reportRepeatingHook('ngAfterContentChecked');
  }

  ngAfterViewInit(): void {
    this.hookFired.emit('ngAfterViewInit');
  }

  ngAfterViewChecked(): void {
    this.reportRepeatingHook('ngAfterViewChecked');
  }

  ngOnDestroy(): void {
    this.hookFired.emit('ngOnDestroy');
  }

  get checkedReadout(): string {
    const counted = [...this.checkCounts].map(
      ([hookName, count]) => `${hookName} ×${count}`,
    );
    return `still running: ${counted.join(' · ')}`;
  }

  private reportRepeatingHook(hookName: string): void {
    const seen = this.checkCounts.get(hookName) ?? 0;
    this.checkCounts.set(hookName, seen + 1);
    // Only the first one goes to the parent: an emit from here dirties the parent's view, and a
    // view that re-dirties itself on every pass cannot be change-detected at all.
    if (seen === 0) this.hookFired.emit(hookName);
  }
}
