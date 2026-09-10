import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { Text, View } from '@symbiote-native/angular';
import {
  readCommitProfile,
  type ICommitProfile,
} from '@symbiote-native/engine';
import { ActionButton } from './ActionButton';
import './JsFrameRateMeter.css';

// 60 Hz budget. Frames are timed on the JS thread only: requestAnimationFrame is scheduled by
// JS, so a stall here is a stall in the code we actually optimize. The native UI thread keeps
// compositing at 60/120 Hz regardless, which is why a native FPS readout would stay flat and
// tell us nothing about the engine's commit cost.
const FRAME_BUDGET_MS = 1000 / 60;

// 1.5x slack so ordinary scheduler jitter (a frame landing a millisecond or two late) is not
// counted as jank - only a frame that missed its slot outright.
const DROPPED_FRAME_THRESHOLD_MS = FRAME_BUDGET_MS * 1.5;

// requestAnimationFrame stops ticking while the app is backgrounded, so the first frame after it
// returns carries the whole suspended interval. That is not jank and must not enter the stats -
// an idle stretch once reported a 102-second "worst frame".
const SUSPENDED_FRAME_MS = 1_000;

// The rate is averaged over a window instead of published per frame: a signal write at 60 Hz would
// itself dominate the very commit path this meter is supposed to observe.
const SAMPLE_WINDOW_MS = 500;

// What the engine was ASKED for inside the last window, beside the frame numbers so the two can be
// read against each other: a stall with no commits under it is not the commit path's.
//
// Counts, never a share of the window. What the engine SPENDS is no longer readable from JS - the
// tree lives in C++ and this side only fills a command buffer, so timing it means instrumenting the
// host, not this meter.
const EMPTY_COMMIT_PROFILE: ICommitProfile = {
  commits: 0,
  propWrites: 0,
  applyMs: 0,
  buildMs: 0,
  commitMs: 0,
  adoptSwaps: 0,
  propClones: 0,
  textSwaps: 0,
  dirtyTexts: 0,
  layoutMs: 0,
  textMs: 0,
  layoutNodes: 0,
  textMeasures: 0,
};

// `readCommitProfile()` is read-and-RESET, and this meter calls it once per window off rAF. A
// benchmark step that wants the profile of its OWN commit must stop the meter first: otherwise a
// window can close inside the step and consume the step's numbers, leaving a plausible zero and no
// sign that anything was lost.
//
// A mutable module field, not a signal and not an @Input. Either would notify the zoneless
// scheduler and refresh this view, and that refresh is a commit landing inside the very window
// being measured — which would both perturb the duration and (because the screen's post-commit hook
// stops the clock on ANY commit) risk settling the step early against the wrong commit.
export const commitProfileGate = { isHeldByBenchmark: false };

/**
 * JS-thread frame rate. A requestAnimationFrame loop measures the delta between consecutive
 * frames, reports the averaged rate over a half-second window, and keeps a running count of
 * frames that arrived later than one and a half budgets - the visible cost of a long commit.
 *
 * Angular twin of ../../react/components/JsFrameRateMeter.tsx. State is `signal()` rather than
 * plain fields because the loop runs outside change detection: a signal write notifies the
 * zoneless scheduler and refreshes only this view, where a `markForCheck` would re-run every
 * ancestor template twice a second (angular-adapter-change-detection §5).
 */
@Component({
  selector: 'JsFrameRateMeter',
  standalone: true,
  imports: [ActionButton, Text, View],
  template: `
    <View class="bench-meter">
      <Text class="section-label">JS-THREAD FRAME RATE</Text>
      <View class="bench-meter-row">
        <View class="bench-metric">
          <Text
            testID="bench-fps"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ framesPerSecond() }}</Text
          >
          <Text class="bench-metric-label">fps</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-dropped"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ droppedFrames() }}</Text
          >
          <Text class="bench-metric-label">dropped</Text>
        </View>
        <View class="bench-metric">
          <Text class="bench-metric-value" [style]="accentStyle">{{
            worstFrameText()
          }}</Text>
          <Text class="bench-metric-label">worst ms</Text>
        </View>
      </View>
      <Text class="section-label">ENGINE PER WINDOW</Text>
      <View class="bench-meter-row">
        <View class="bench-metric">
          <Text
            testID="bench-commits"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ engine().commits }}</Text
          >
          <Text class="bench-metric-label">commits</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-commit-writes"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ engine().propWrites }}</Text
          >
          <Text class="bench-metric-label">prop writes</Text>
        </View>
      </View>
      <ActionButton
        testID="bench-fps-reset"
        title="Reset frame counters"
        [color]="accentColor"
        (press)="onReset()"
      ></ActionButton>
    </View>
  `,
})
export class JsFrameRateMeter implements OnInit, OnDestroy {
  // Written once from the input setter rather than rebuilt by a getter: a fresh literal per
  // change-detection pass would re-push `style` onto all six metric Texts every pass.
  accentColor = '';
  accentStyle: Record<string, string> = {};

  @Input({ required: true })
  set accent(value: string) {
    this.accentColor = value;
    this.accentStyle = { color: value };
  }

  readonly framesPerSecond = signal(0);
  readonly droppedFrames = signal(0);
  readonly worstFrameMs = signal(0);
  readonly engine = signal<ICommitProfile>(EMPTY_COMMIT_PROFILE);

  private dropped = 0;
  private worst = 0;
  private handle = 0;
  private stopped = false;

  ngOnInit(): void {
    let previousFrameAt = performance.now();
    let windowStartedAt = previousFrameAt;
    let framesInWindow = 0;

    const onFrame = (): void => {
      if (this.stopped) return;
      const now = performance.now();
      const deltaMs = now - previousFrameAt;
      previousFrameAt = now;
      framesInWindow += 1;

      if (deltaMs < SUSPENDED_FRAME_MS) {
        if (deltaMs > DROPPED_FRAME_THRESHOLD_MS) this.dropped += 1;
        if (deltaMs > this.worst) this.worst = deltaMs;
      }

      const windowMs = now - windowStartedAt;
      // While a benchmark step holds the gate the whole window-close block is skipped, publish and
      // reset alike: the readCommitProfile() below would eat the step's profile, and the four
      // signal writes would put an extra commit inside its measured window. The window simply grows
      // and publishes once, longer, after the step releases.
      if (
        windowMs >= SAMPLE_WINDOW_MS &&
        !commitProfileGate.isHeldByBenchmark
      ) {
        this.framesPerSecond.set(
          Math.round((framesInWindow * 1000) / windowMs),
        );
        this.droppedFrames.set(this.dropped);
        this.worstFrameMs.set(this.worst);
        // Read-and-reset, once per window, so each sample covers exactly the window just closed
        // rather than an ever-growing total.
        this.engine.set(readCommitProfile());
        framesInWindow = 0;
        windowStartedAt = now;
      }

      this.handle = requestAnimationFrame(onFrame);
    };

    this.handle = requestAnimationFrame(onFrame);
  }

  ngOnDestroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.handle);
  }

  worstFrameText(): string {
    return this.worstFrameMs().toFixed(0);
  }

  onReset(): void {
    this.dropped = 0;
    this.worst = 0;
    this.droppedFrames.set(0);
    this.worstFrameMs.set(0);
    this.engine.set(EMPTY_COMMIT_PROFILE);
  }
}
