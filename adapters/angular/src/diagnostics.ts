// Per-window counters for the Angular adapter, the twin of the engine's readCommitProfile().
// The engine's number answers "what did the commit walk cost"; these answer the question one layer
// up, which is the one Angular keeps losing: HOW MANY TIMES did anything run at all.
//
// Angular is the only adapter whose update model can free-run. A change-detection pass that writes
// a fresh reference into a downstream @Input marks a view dirty, the zoneless scheduler books
// another pass, and it never settles - the hazard `stableAnchorStyle` and VirtualizedList's
// `lastRecompute` gate each guard one instance of. A guard that stops holding is INVISIBLE from the
// outside: the screen paints correctly, only the frame rate collapses. `cdPasses` at rest is what
// makes it visible, and every other counter here narrows the same window to a suspect.
//
// Deliberately NOT gated behind isDebug(): an integer increment is noise next to the work it
// counts, and the numbers are only meaningful from a RELEASE build (dev-mode Angular runs its own
// checks and drowns the signal). The per-name detail map IS gated, since it allocates.

export interface IAngularProfile {
  // Change-detection passes: RendererFactory2.end() runs once per ApplicationRef.tick().
  cdPasses: number;
  // Primitive host views (symbiote-view / symbiote-text / ...) Angular actually walked. Divided by
  // cdPasses this is the SIZE OF THE TREE one tick touches - the number that separates "the list is
  // expensive" from "every mounted screen is re-checked because a list scrolled". The primitives are
  // CheckAlways, and a Global tick refreshes every CheckAlways view in the application.
  viewsChecked: number;
  // Prop/style/class/text writes that reached the engine. At rest this must be 0: a nonzero idle
  // value means change detection is rewriting props nothing asked to change.
  rendererWrites: number;
  nodesCreated: number;
  nodesInserted: number;
  nodesRemoved: number;
  // The `class` poll every COMPOSED component runs per check (SymbioteStyleInputDirective: Pressable,
  // ScrollView, Image, the lists...; the raw primitives are counted by `viewsChecked` instead).
  // `styleMarks` is how often the poll actually found a change and dirtied the view - the ratio is
  // how much of the polling is wasted, and a nonzero idle `styleMarks` is a free-run engine.
  styleChecks: number;
  styleMarks: number;
  // VirtualizedList: checks vs the ones that got past the `lastRecompute` dedup gate. Recomputes
  // climbing with checks means the gate is not holding, which is the free-run bug itself.
  listChecks: number;
  listRecomputes: number;
  listMarks: number;
  // Scroll events the list saw. With sticky headers RN pins scrollEventThrottle to 1, so this is
  // the frame rate of the gesture and the denominator for everything measured during a drag.
  scrollTicks: number;
  // Cell views. `outletUpdates` is the cheap path (context patched in place); `outletCreates` past
  // the first window means cells are being rebuilt instead of reused, which is the cost CDK's
  // view-recycling strategy exists to avoid.
  outletCreates: number;
  outletUpdates: number;
  outletDestroys: number;
  // Sticky projection: schedules are cheap (a Set insert), flushes walk every projected record.
  projectionSchedules: number;
  projectionFlushes: number;
  // A sticky wrapper rebuilt loses its measured layout and costs a native round trip; reuse is the
  // fixed path. Creates climbing during a plain scroll is the regression this pair pins.
  stickyWrapperCreates: number;
  stickyWrapperReuses: number;
}

type IAngularCounter = keyof IAngularProfile;

function createCounters(): IAngularProfile {
  return {
    cdPasses: 0,
    viewsChecked: 0,
    rendererWrites: 0,
    nodesCreated: 0,
    nodesInserted: 0,
    nodesRemoved: 0,
    styleChecks: 0,
    styleMarks: 0,
    listChecks: 0,
    listRecomputes: 0,
    listMarks: 0,
    scrollTicks: 0,
    outletCreates: 0,
    outletUpdates: 0,
    outletDestroys: 0,
    projectionSchedules: 0,
    projectionFlushes: 0,
    stickyWrapperCreates: 0,
    stickyWrapperReuses: 0,
  };
}

let counters = createCounters();

export function countAngular(counter: IAngularCounter): void {
  counters[counter] += 1;
}

// Reading zeroes the counters, so a sampler on an interval gets disjoint windows rather than a
// growing total - same contract as readCommitProfile().
export function readAngularProfile(): IAngularProfile {
  const snapshot = counters;
  counters = createCounters();
  return snapshot;
}

// Which prop names the renderer actually rewrites, and which host tags get created. Off by default
// because it allocates per write; the probe screen turns it on for one sample. A write nothing
// asked for is the whole diagnosis, and the prop NAME is what points at the binding responsible.
let isDetailEnabled = false;
const writesByProp = new Map<string, number>();
const createsByTag = new Map<string, number>();

export function setAngularProfileDetail(enabled: boolean): void {
  isDetailEnabled = enabled;
  if (!enabled) {
    writesByProp.clear();
    createsByTag.clear();
  }
}

export function noteAngularWrite(propName: string): void {
  if (!isDetailEnabled) return;
  writesByProp.set(propName, (writesByProp.get(propName) ?? 0) + 1);
}

export function noteAngularCreate(tagName: string): void {
  if (!isDetailEnabled) return;
  createsByTag.set(tagName, (createsByTag.get(tagName) ?? 0) + 1);
}

export interface IAngularProfileDetail {
  writesByProp: readonly (readonly [string, number])[];
  createsByTag: readonly (readonly [string, number])[];
}

// Sorted hottest-first and read-and-cleared, so a sample names its own top offenders.
export function readAngularProfileDetail(): IAngularProfileDetail {
  const detail = {
    writesByProp: [...writesByProp.entries()].sort((a, b) => b[1] - a[1]),
    createsByTag: [...createsByTag.entries()].sort((a, b) => b[1] - a[1]),
  };
  writesByProp.clear();
  createsByTag.clear();
  return detail;
}
