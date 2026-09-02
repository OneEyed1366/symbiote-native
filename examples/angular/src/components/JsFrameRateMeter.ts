import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { Text, View } from '@symbiote-native/angular';
import { readCommitProfile } from '@symbiote-native/engine';
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

// What the engine's reconcile walk cost inside the last window, next to the frame numbers so the
// two can be read against each other: the walk is a term in every adapter's frame budget.
//
// Reported as two halves, never as `walkMs / nodesVisited`. Dirty-marking means the denominator
// counts only the nodes reconcile did NOT skip, while the numerator still covers everything it does
// (the JSI createNode/appendChild calls included), so that ratio inflates by the skip factor: 13.4
// us/node without dirty-marking, 438 us/node with it, on a device that had got ~2x faster. So
// `nodesPerCommit` is the skip itself (read against the screen's node count) and `msPerCommit` is
// what a commit costs. A true per-node figure needs a full walk - a cold mount, where nothing is
// skippable.
type IWalkSample = {
  sharePercent: number;
  nodesPerCommit: number;
  msPerCommit: number;
};

const EMPTY_WALK_SAMPLE: IWalkSample = {
  sharePercent: 0,
  nodesPerCommit: 0,
  msPerCommit: 0,
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
      <Text class="section-label">ENGINE RECONCILE WALK</Text>
      <View class="bench-meter-row">
        <View class="bench-metric">
          <Text
            testID="bench-walk-share"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ walkShareText() }}</Text
          >
          <Text class="bench-metric-label">% of window</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-walk-nodes-per-commit"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ walkNodesText() }}</Text
          >
          <Text class="bench-metric-label">nodes / commit</Text>
        </View>
        <View class="bench-metric">
          <Text
            testID="bench-walk-ms-per-commit"
            class="bench-metric-value"
            [style]="accentStyle"
            >{{ walkMsText() }}</Text
          >
          <Text class="bench-metric-label">ms / commit</Text>
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
  readonly walk = signal<IWalkSample>(EMPTY_WALK_SAMPLE);

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
        const commitProfile = readCommitProfile();
        this.walk.set({
          sharePercent: (commitProfile.walkMs / windowMs) * 100,
          nodesPerCommit:
            commitProfile.commits === 0
              ? 0
              : commitProfile.nodesVisited / commitProfile.commits,
          msPerCommit:
            commitProfile.commits === 0
              ? 0
              : commitProfile.walkMs / commitProfile.commits,
        });
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

  walkShareText(): string {
    return this.walk().sharePercent.toFixed(1);
  }

  walkNodesText(): string {
    return this.walk().nodesPerCommit.toFixed(0);
  }

  walkMsText(): string {
    return this.walk().msPerCommit.toFixed(1);
  }

  onReset(): void {
    this.dropped = 0;
    this.worst = 0;
    this.droppedFrames.set(0);
    this.worstFrameMs.set(0);
    this.walk.set(EMPTY_WALK_SAMPLE);
  }
}
