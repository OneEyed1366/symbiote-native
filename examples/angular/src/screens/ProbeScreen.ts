import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  SafeAreaView,
  ScrollView,
  SectionList,
  Text,
  View,
  VSectionHeaderDirective,
  VSectionItemDirective,
  readAngularProfile,
  readAngularProfileDetail,
  setAngularProfileDetail,
  type IAngularProfile,
  type IAngularProfileDetail,
  type ISection,
} from '@symbiote-native/angular';
import { readCommitProfile, type ICommitProfile } from '@symbiote-native/engine';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
// static look compiled at build time by @symbiote-native/css-parser
import './ProbeScreen.css';

// The screen answers one question the frame-rate meter cannot: WHY the frames go. The meter prices
// the symptom (a slow frame); these counters name which layer produced the work, and the idle
// sample is the discriminator no other adapter needs — React, Vue and Svelte cannot re-run a render
// with nothing to render, and Angular can. A change-detection pass that writes a fresh reference
// into a downstream @Input marks a view dirty, the zoneless scheduler books another pass, and it
// free-runs. `stableAnchorStyle` and VirtualizedList's `lastRecompute` gate each stop one instance
// of it; a third one nobody guarded looks exactly like "Angular is just slow".

const SAMPLE_MS = 3_000;
// A press repaints the button, and that repaint is itself a change-detection pass. Zeroing the
// counters only after it has settled keeps the screen's own UI out of its own measurement - the
// bias that made every earlier reading unusable.
const SETTLE_MS = 300;
const MS_PER_SECOND = 1000;

const STRESS_SECTION_COUNT = 16;
const STRESS_ROWS_PER_SECTION = 32;
const STRESS_ROW_HEIGHT = 30;
const STRESS_HEADER_HEIGHT = 28;
// SectionList emits a footer row per section even with no renderSectionFooter (it paints nothing
// and takes no height), so the flat index space has one extra entry per section.
const STRESS_FOOTER_HEIGHT = 0;
const STRESS_ENTRIES_PER_SECTION = 1 + STRESS_ROWS_PER_SECTION + 1;
const STRESS_SECTION_EXTENT =
  STRESS_HEADER_HEIGHT + STRESS_ROWS_PER_SECTION * STRESS_ROW_HEIGHT;

type IProbeItem = { id: string; label: string };

function isProbeItem(value: unknown): value is IProbeItem {
  return typeof value === 'object' && value !== null && 'label' in value;
}

const STRESS_SECTIONS: readonly ISection<IProbeItem>[] = Array.from(
  { length: STRESS_SECTION_COUNT },
  (_unused, sectionIndex) => ({
    title: `Section ${sectionIndex + 1}`,
    data: Array.from({ length: STRESS_ROWS_PER_SECTION }, (_row, rowIndex) => ({
      id: `${sectionIndex}-${rowIndex}`,
      label: `row ${rowIndex + 1}`,
    })),
  }),
);

// Fixed layout: without it the list measures a cell before it can place it, and a fast drag
// outruns measurement and leaves the window blank - which would show up in the counters as the
// list's problem rather than the missing fast path's.
function stressItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const sectionIndex = Math.floor(index / STRESS_ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * STRESS_ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * STRESS_SECTION_EXTENT;
  if (withinSection === 0) {
    return { length: STRESS_HEADER_HEIGHT, offset: sectionOffset, index };
  }
  if (withinSection === STRESS_ENTRIES_PER_SECTION - 1) {
    return {
      length: STRESS_FOOTER_HEIGHT,
      offset: sectionOffset + STRESS_SECTION_EXTENT,
      index,
    };
  }
  const rowIndex = withinSection - 1;
  return {
    length: STRESS_ROW_HEIGHT,
    offset: sectionOffset + STRESS_HEADER_HEIGHT + rowIndex * STRESS_ROW_HEIGHT,
    index,
  };
}

const SAMPLE_MODE = {
  // Nothing touches the screen. Every counter here should read 0; whatever does not is work the
  // app never asked for.
  Idle: 'idle',
  // Drag the list for the whole window. Counters divided by `scrollTicks` give the per-frame cost
  // of a scroll, which is the number that decides whether a list can hold 60 fps.
  Scroll: 'scroll',
} as const;
type ISampleMode = (typeof SAMPLE_MODE)[keyof typeof SAMPLE_MODE];

type IProbeSample = {
  mode: ISampleMode;
  elapsedMs: number;
  angular: IAngularProfile;
  commit: ICommitProfile;
  detail: IAngularProfileDetail;
};

type ICounterRow = {
  label: string;
  value: string;
  perSecond: string;
};

const EMPTY_VALUE = '-';

function perSecond(total: number, elapsedMs: number): string {
  if (elapsedMs <= 0) return EMPTY_VALUE;
  return ((total * MS_PER_SECOND) / elapsedMs).toFixed(1);
}

function ratio(numerator: number, denominator: number): string {
  return denominator === 0 ? EMPTY_VALUE : (numerator / denominator).toFixed(2);
}

@Component({
  selector: 'symbiote-probe-screen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    SafeAreaView,
    ScrollView,
    SectionList,
    Text,
    View,
    VSectionHeaderDirective,
    VSectionItemDirective,
  ],
  template: `
    <SafeAreaView class="screen">
      <ScrollView class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">PR</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Angular probe</Text>
            <Text class="hero-body">
              Counts change-detection passes, renderer writes and cell views per
              sample window. Idle must read zero everywhere.
            </Text>
          </View>
        </View>

        <Text class="section-label">SAMPLE</Text>
        <View class="probe-run-row">
          <View class="flex1">
            <ActionButton
              testID="probe-sample-idle"
              [title]="idleTitle()"
              [color]="accent"
              (press)="onSample(idleMode)"
            ></ActionButton>
          </View>
          <View class="flex1">
            <ActionButton
              testID="probe-sample-scroll"
              [title]="scrollTitle()"
              [color]="accent"
              (press)="onSample(scrollMode)"
            ></ActionButton>
          </View>
        </View>
        <ActionButton
          testID="probe-toggle-detail"
          [title]="detailTitle()"
          [color]="accent"
          (press)="onToggleDetail()"
        ></ActionButton>
        <Text class="note-text">{{ instructions() }}</Text>

        @if (verdicts().length > 0) {
          <Text class="section-label">WHAT THE SAMPLE SAYS</Text>
          @for (verdict of verdicts(); track verdict) {
            <View class="probe-verdict">
              <Text class="probe-verdict-text">{{ verdict }}</Text>
            </View>
          }
        }

        @if (counterRows().length > 0) {
          <Text class="section-label">{{ sampleHeading() }}</Text>
          <View class="probe-row probe-row-head">
            <Text class="probe-cell-label">counter</Text>
            <Text class="probe-cell">total</Text>
            <Text class="probe-cell">per sec</Text>
          </View>
          @for (row of counterRows(); track row.label) {
            <View class="probe-row">
              <Text class="probe-cell-label">{{ row.label }}</Text>
              <Text class="probe-cell">{{ row.value }}</Text>
              <Text class="probe-cell">{{ row.perSecond }}</Text>
            </View>
          }
        }

        @if (detailRows().length > 0) {
          <Text class="section-label">HOTTEST WRITES</Text>
          @for (row of detailRows(); track row.label) {
            <View class="probe-row">
              <Text class="probe-cell-label">{{ row.label }}</Text>
              <Text class="probe-cell">{{ row.value }}</Text>
              <Text class="probe-cell">{{ row.perSecond }}</Text>
            </View>
          }
        }

        <Text class="section-label">STRESS SUBJECT</Text>
        <Text class="note-text">{{ stressNote }}</Text>
        <SectionList
          testID="probe-sticky-section-list"
          class="probe-sticky"
          [sections]="sections"
          [keyExtractor]="keyExtractor"
          [stickySectionHeadersEnabled]="true"
          [scrollEventThrottle]="16"
          [getItemLayout]="itemLayout"
        >
          <ng-template vSectionHeader let-section>
            <Text class="section-header" [style]="headerStyle">{{
              section.title
            }}</Text>
          </ng-template>
          <ng-template vSectionItem let-item>
            <View class="parity-row" [style]="rowStyle">
              <Text class="list-row-text">{{ itemLabel(item) }}</Text>
            </View>
          </ng-template>
        </SectionList>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class ProbeScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Probe];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly accent = LINE_COLOR.performance;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.performance };

  readonly idleMode = SAMPLE_MODE.Idle;
  readonly scrollMode = SAMPLE_MODE.Scroll;

  readonly sections = STRESS_SECTIONS;
  readonly itemLayout = stressItemLayout;
  readonly headerStyle = { height: STRESS_HEADER_HEIGHT };
  readonly rowStyle = { height: STRESS_ROW_HEIGHT };
  readonly stressNote = `${STRESS_SECTION_COUNT} sections x ${STRESS_ROWS_PER_SECTION} rows, sticky headers - the shape that drops frames.`;

  readonly keyExtractor = (item: IProbeItem): string => item.id;

  private readonly sample = signal<IProbeSample | undefined>(undefined);
  private readonly runningMode = signal<ISampleMode | undefined>(undefined);
  private readonly isDetailOn = signal(false);

  readonly idleTitle = computed(() =>
    this.runningMode() === SAMPLE_MODE.Idle ? 'Sampling, hands off...' : 'Sample 3 s idle',
  );

  readonly scrollTitle = computed(() =>
    this.runningMode() === SAMPLE_MODE.Scroll ? 'Sampling, keep dragging' : 'Sample 3 s scrolling',
  );

  readonly detailTitle = computed(() =>
    this.isDetailOn() ? 'Per-prop detail: ON' : 'Per-prop detail: off',
  );

  readonly instructions = computed(() => {
    if (this.runningMode() === SAMPLE_MODE.Idle) return 'Do not touch the screen until it stops.';
    if (this.runningMode() === SAMPLE_MODE.Scroll) return 'Drag the list below for the whole window.';
    return 'Idle first: every counter should be 0. Whatever is not is work nothing asked for.';
  });

  readonly sampleHeading = computed(() => {
    const current = this.sample();
    if (current === undefined) return 'COUNTERS';
    return `COUNTERS - ${current.mode.toUpperCase()} over ${(current.elapsedMs / MS_PER_SECOND).toFixed(1)} s`;
  });

  readonly counterRows = computed<readonly ICounterRow[]>(() => {
    const current = this.sample();
    if (current === undefined) return [];
    const { angular, commit, elapsedMs } = current;
    const row = (label: string, total: number): ICounterRow => ({
      label,
      value: String(total),
      perSecond: perSecond(total, elapsedMs),
    });
    return [
      row('CD passes', angular.cdPasses),
      row('primitive views checked', angular.viewsChecked),
      row('renderer writes', angular.rendererWrites),
      row('nodes created', angular.nodesCreated),
      row('nodes inserted', angular.nodesInserted),
      row('nodes removed', angular.nodesRemoved),
      row('composed class polls', angular.styleChecks),
      row('class polls that dirtied', angular.styleMarks),
      row('list checks', angular.listChecks),
      row('list recomputes', angular.listRecomputes),
      row('list marks', angular.listMarks),
      row('scroll ticks', angular.scrollTicks),
      row('cell views created', angular.outletCreates),
      row('cell contexts patched', angular.outletUpdates),
      row('cell views destroyed', angular.outletDestroys),
      row('projection schedules', angular.projectionSchedules),
      row('projection flushes', angular.projectionFlushes),
      row('sticky wrappers built', angular.stickyWrapperCreates),
      row('sticky wrappers reused', angular.stickyWrapperReuses),
      row('engine commits', commit.commits),
      {
        label: 'engine walk ms',
        value: commit.walkMs.toFixed(1),
        perSecond: perSecond(commit.walkMs, elapsedMs),
      },
      {
        label: 'views per CD pass',
        value: ratio(angular.viewsChecked, angular.cdPasses),
        perSecond: EMPTY_VALUE,
      },
      {
        label: 'CD per scroll frame',
        value: ratio(angular.cdPasses, angular.scrollTicks),
        perSecond: EMPTY_VALUE,
      },
      {
        label: 'writes per CD pass',
        value: ratio(angular.rendererWrites, angular.cdPasses),
        perSecond: EMPTY_VALUE,
      },
    ];
  });

  readonly detailRows = computed<readonly ICounterRow[]>(() => {
    const current = this.sample();
    if (current === undefined) return [];
    const { detail, elapsedMs } = current;
    return [
      ...detail.writesByProp.map(([name, count]) => ({
        label: `write ${name}`,
        value: String(count),
        perSecond: perSecond(count, elapsedMs),
      })),
      ...detail.createsByTag.map(([name, count]) => ({
        label: `create ${name}`,
        value: String(count),
        perSecond: perSecond(count, elapsedMs),
      })),
    ];
  });

  // Every line names a layer AND the counter that convicts it, so the next step is a file to open
  // rather than another guess.
  readonly verdicts = computed<readonly string[]>(() => {
    const current = this.sample();
    if (current === undefined) return [];
    const { angular, commit, mode, elapsedMs } = current;
    const found: string[] = [];
    const seconds = elapsedMs / MS_PER_SECOND;

    if (mode === SAMPLE_MODE.Idle) {
      if (angular.cdPasses > seconds) {
        found.push(
          `Change detection free-runs at rest: ${angular.cdPasses} passes with no input. Something re-dirties a view inside the pass.`,
        );
      }
      if (angular.rendererWrites > 0) {
        found.push(
          `${angular.rendererWrites} prop writes with nothing changing. Turn on per-prop detail and read the top name.`,
        );
      }
      if (angular.listRecomputes > 0) {
        found.push(
          `The list recompute gate let ${angular.listRecomputes} of ${angular.listChecks} checks through at rest (lastRecompute in virtualized-list/index.ts).`,
        );
      }
      if (angular.styleMarks > 0) {
        found.push(
          `The class poll dirtied a view ${angular.styleMarks} times at rest (SymbioteStyleInputDirective.ngDoCheck).`,
        );
      }
      if (commit.commits > 0) {
        found.push(`The engine committed ${commit.commits} times at rest, so the writes reach Fabric.`);
      }
      if (found.length === 0) {
        found.push('Clean at rest. The cost is inside a pass, not the number of passes - sample while scrolling next.');
      }
      return found;
    }

    if (angular.scrollTicks === 0) {
      return ['No scroll events arrived. Drag the list below while the sample runs.'];
    }
    const passesPerFrame = angular.cdPasses / angular.scrollTicks;
    if (passesPerFrame > 1.5) {
      found.push(
        `${passesPerFrame.toFixed(1)} change-detection passes per scroll frame. One frame should cost one pass.`,
      );
    }
    if (angular.outletCreates > 0) {
      found.push(
        `${angular.outletCreates} cell views rebuilt instead of reused - the whole template is re-stamped as the window moves.`,
      );
    }
    if (angular.stickyWrapperCreates > 0) {
      found.push(
        `${angular.stickyWrapperCreates} sticky wrappers rebuilt; each one loses its measured layout and costs a native round trip.`,
      );
    }
    if (angular.cdPasses > 0) {
      found.push(
        `${(angular.viewsChecked / angular.cdPasses).toFixed(0)} primitive views walked per pass. Compare it with what this screen actually holds - a bigger number means other mounted screens are being re-checked too.`,
      );
    }
    if (angular.projectionFlushes > angular.scrollTicks) {
      found.push(
        `${angular.projectionFlushes} projection flushes for ${angular.scrollTicks} frames - the sticky walk runs more than once a frame.`,
      );
    }
    if (found.length === 0) {
      found.push('One pass per frame, cells reused. The cost is inside the pass - read the walk ms and the write count.');
    }
    return found;
  });

  onToggleDetail(): void {
    const next = !this.isDetailOn();
    this.isDetailOn.set(next);
    setAngularProfileDetail(next);
  }

  onSample(mode: ISampleMode): void {
    if (this.runningMode() !== undefined) return;
    this.runningMode.set(mode);
    // Two nested timeouts, not one: the first lets the button's own repaint finish, and only then
    // do the counters get zeroed. Reading immediately would fold this screen's UI into its sample.
    setTimeout(() => {
      readAngularProfile();
      readCommitProfile();
      readAngularProfileDetail();
      const startedAt = performance.now();
      setTimeout(() => {
        const angular = readAngularProfile();
        const commit = readCommitProfile();
        const detail = readAngularProfileDetail();
        this.sample.set({
          mode,
          elapsedMs: performance.now() - startedAt,
          angular,
          commit,
          detail,
        });
        this.runningMode.set(undefined);
      }, SAMPLE_MS);
    }, SETTLE_MS);
  }

  itemLabel(item: unknown): string {
    return isProbeItem(item) ? item.label : '';
  }
}
