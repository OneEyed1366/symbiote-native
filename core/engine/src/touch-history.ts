// Per-touch position and time tracking for `PanResponder`'s multitouch dx/vx math
// TODO(rn-port): a copy of RN's `ResponderTouchHistoryStore` on purpose, RN throws on a touch
// without an identifier, and a throw inside responder negotiation would drop real touches

import { isRecord } from './type-guards';

// One slot per active touch identifier. Mirrors RN's TouchRecord field-for-field.
type ITouchRecord = {
  touchActive: boolean;
  startPageX: number;
  startPageY: number;
  startTimeStamp: number;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
  previousTimeStamp: number;
};

type ITouchHistory = {
  touchBank: ITouchRecord[];
  numberActiveTouches: number;
  // The single active touch's identifier, so `TouchHistoryMath` skips the bank scan
  // It is -1 when not exactly one touch is down
  indexOfSingleActiveTouch: number;
  mostRecentTimeStamp: number;
};

// RN's bank is indexed by touch identifier and warns above 20; we never warn (headless
// events may carry larger or absent ids), we just skip anything out of a sane range.
const MAX_TOUCH_BANK = 20;

const touchBank: ITouchRecord[] = [];
export const touchHistory: ITouchHistory = {
  touchBank,
  numberActiveTouches: 0,
  indexOfSingleActiveTouch: -1,
  mostRecentTimeStamp: 0,
};

// A raw touch as it arrives inside the untyped nativeEvent. Each field is narrowed defensively so
// a malformed or coordinate-less touch is skipped, never thrown — recording must not perturb the
// responder negotiation.
type INormalizedTouch = {
  identifier: number;
  pageX: number;
  pageY: number;
  timestamp: number;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

// Pull a recordable touch out of an untyped entry. RN's getTouchIdentifier throws on
// a null id; we skip instead, so events without touch geometry leave the bank untouched.
function normalizeTouch(raw: unknown): INormalizedTouch | undefined {
  if (!isRecord(raw)) return undefined;
  const identifier = toFiniteNumber(raw.identifier);
  const pageX = toFiniteNumber(raw.pageX);
  const pageY = toFiniteNumber(raw.pageY);
  if (identifier === undefined || pageX === undefined || pageY === undefined)
    return undefined;
  if (identifier < 0 || identifier > MAX_TOUCH_BANK) return undefined;
  return {
    identifier,
    pageX,
    pageY,
    timestamp: toFiniteNumber(raw.timestamp) ?? 0,
  };
}

// The changed touches for this frame (start/move/end), defensively read.
function changedTouchesOf(
  nativeEvent: Record<string, unknown>,
): INormalizedTouch[] {
  const raw = nativeEvent.changedTouches;
  if (!Array.isArray(raw)) return [];
  const out: INormalizedTouch[] = [];
  for (const entry of raw) {
    const touch = normalizeTouch(entry);
    if (touch !== undefined) out.push(touch);
  }
  return out;
}

// Count of all touches still down (RN reads nativeEvent.touches.length directly).
function activeTouchCount(nativeEvent: Record<string, unknown>): number {
  const raw = nativeEvent.touches;
  return Array.isArray(raw) ? raw.length : 0;
}

function recordTouchStart(touch: INormalizedTouch): void {
  const record = touchBank[touch.identifier];
  if (record) {
    record.touchActive = true;
    record.startPageX = touch.pageX;
    record.startPageY = touch.pageY;
    record.startTimeStamp = touch.timestamp;
    record.currentPageX = touch.pageX;
    record.currentPageY = touch.pageY;
    record.currentTimeStamp = touch.timestamp;
    record.previousPageX = touch.pageX;
    record.previousPageY = touch.pageY;
    record.previousTimeStamp = touch.timestamp;
  } else {
    touchBank[touch.identifier] = {
      touchActive: true,
      startPageX: touch.pageX,
      startPageY: touch.pageY,
      startTimeStamp: touch.timestamp,
      currentPageX: touch.pageX,
      currentPageY: touch.pageY,
      currentTimeStamp: touch.timestamp,
      previousPageX: touch.pageX,
      previousPageY: touch.pageY,
      previousTimeStamp: touch.timestamp,
    };
  }
  touchHistory.mostRecentTimeStamp = touch.timestamp;
}

// Move and end share the previous<-current shift; only `touchActive` differs.
function shiftTouchRecord(touch: INormalizedTouch, active: boolean): void {
  const record = touchBank[touch.identifier];
  if (!record) return;
  record.touchActive = active;
  record.previousPageX = record.currentPageX;
  record.previousPageY = record.currentPageY;
  record.previousTimeStamp = record.currentTimeStamp;
  record.currentPageX = touch.pageX;
  record.currentPageY = touch.pageY;
  record.currentTimeStamp = touch.timestamp;
  touchHistory.mostRecentTimeStamp = touch.timestamp;
}

function arrayFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

// Records one touch frame into the bank by phase, as RN's `recordTouchTrack` does
export function recordTouchTrack(
  kind: 'start' | 'move' | 'end',
  nativeEvent: Record<string, unknown>,
): void {
  if (kind === 'move') {
    for (const touch of changedTouchesOf(nativeEvent))
      shiftTouchRecord(touch, true);
    return;
  }
  if (kind === 'start') {
    recordStartFrame(nativeEvent);
    return;
  }
  recordEndFrame(nativeEvent);
}

// Kept apart from `recordTouchTrack` so each phase reads on its own
function recordStartFrame(nativeEvent: Record<string, unknown>): void {
  for (const touch of changedTouchesOf(nativeEvent)) recordTouchStart(touch);
  touchHistory.numberActiveTouches = activeTouchCount(nativeEvent);
  if (touchHistory.numberActiveTouches !== 1) return;
  const first = normalizeTouch(arrayFirst(nativeEvent.touches));
  touchHistory.indexOfSingleActiveTouch = first?.identifier ?? -1;
}

function recordEndFrame(nativeEvent: Record<string, unknown>): void {
  for (const touch of changedTouchesOf(nativeEvent)) {
    shiftTouchRecord(touch, false);
  }
  touchHistory.numberActiveTouches = activeTouchCount(nativeEvent);
  if (touchHistory.numberActiveTouches !== 1) return;
  const activeIndex = touchBank.findIndex(record => record?.touchActive);
  if (activeIndex !== -1) touchHistory.indexOfSingleActiveTouch = activeIndex;
}

// Drop all touch state. Called on a fully-released / cancelled gesture so a stale bank
// never leaks geometry into the next gesture's first frame.
export function resetTouchHistory(): void {
  touchBank.length = 0;
  touchHistory.numberActiveTouches = 0;
  touchHistory.indexOfSingleActiveTouch = -1;
  touchHistory.mostRecentTimeStamp = 0;
}

// Attach the live touch history onto the event the responder handlers receive, matching
// ResponderEventPlugin.js (`grantEvent.touchHistory = ...`, etc.). PanResponder reads
// it for the per-touch dx/vx math; handlers that ignore it are unaffected.
export function attachTouchHistory(nativeEvent: Record<string, unknown>): void {
  nativeEvent.touchHistory = touchHistory;
}
