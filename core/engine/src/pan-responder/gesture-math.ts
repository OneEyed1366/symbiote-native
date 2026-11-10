// Геометрия жеста: касания из события и накопление dx/dy/vx/vy
// Без `touchHistory` считаем по `nativeEvent.touches`, как для одного пальца в headless

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import TouchHistoryMath from 'react-native/Libraries/Interaction/TouchHistoryMath';
import type { ISymbioteEvent } from '../node';
import { isRecord } from '../type-guards';

// `_accountsForMovesUpTo` - метка времени, до которой продвинуты все поля
export type IPanResponderGestureState = {
  stateID: number;
  moveX: number;
  moveY: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
  _accountsForMovesUpTo: number;
};

// Касание из нетипизированной записи `nativeEvent`
export type ITouchPoint = {
  pageX: number;
  pageY: number;
  timestamp: number;
};

// Слот банка `nativeEvent.touchHistory`, как `ITouchRecord` в RN
type ITouchRecord = {
  touchActive: boolean;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
};

export type ITouchHistory = {
  touchBank: ITouchRecord[];
  numberActiveTouches: number;
  indexOfSingleActiveTouch: number;
  mostRecentTimeStamp: number;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

// Касание без числовых `pageX`/`pageY` пропускается, без `timestamp` время 0
function toTouchPoint(raw: unknown): ITouchPoint | undefined {
  if (!isRecord(raw)) return undefined;
  const pageX = toFiniteNumber(raw.pageX);
  const pageY = toFiniteNumber(raw.pageY);
  if (pageX === undefined || pageY === undefined) return undefined;
  return { pageX, pageY, timestamp: toFiniteNumber(raw.timestamp) ?? 0 };
}

export function readTouches(event: ISymbioteEvent): ITouchPoint[] {
  const raw = event.nativeEvent.touches;
  if (!Array.isArray(raw)) return [];
  const points: ITouchPoint[] = [];
  for (const entry of raw) {
    const point = toTouchPoint(entry);
    if (point !== undefined) points.push(point);
  }
  return points;
}

// Центроид по активным касаниям, как усреднение в `TouchHistoryMath`
export function centroidX(touches: ITouchPoint[]): number {
  if (touches.length === 0) return 0;
  let sum = 0;
  for (const touch of touches) sum += touch.pageX;
  return sum / touches.length;
}

export function centroidY(touches: ITouchPoint[]): number {
  if (touches.length === 0) return 0;
  let sum = 0;
  for (const touch of touches) sum += touch.pageY;
  return sum / touches.length;
}

// Часы кадра: до этой метки продвигается `_accountsForMovesUpTo`, на разницу делится скорость
function mostRecentTimestamp(touches: ITouchPoint[]): number {
  let latest = 0;
  for (const touch of touches) {
    if (touch.timestamp > latest) latest = touch.timestamp;
  }
  return latest;
}

function isTouchHistory(value: unknown): value is ITouchHistory {
  return (
    isRecord(value) &&
    Array.isArray(value.touchBank) &&
    typeof value.numberActiveTouches === 'number' &&
    typeof value.indexOfSingleActiveTouch === 'number' &&
    typeof value.mostRecentTimeStamp === 'number'
  );
}

// Банк касаний кладёт в событие движок, как `ResponderEventPlugin` в RN
// Без него (прямой вызов обработчиков) работает центроидный путь ниже
export function touchHistoryOf(
  event: ISymbioteEvent,
): ITouchHistory | undefined {
  const raw = event.nativeEvent.touchHistory;
  return isTouchHistory(raw) ? raw : undefined;
}

// Модуль RN подключён, а не переписан: у него два скана (`>` для одного касания, `>=` для
// нескольких), и их легко воспроизвести с ошибкой
function currentCentroidXOfChanged(
  touchHistory: ITouchHistory,
  after: number,
): number {
  return TouchHistoryMath.currentCentroidXOfTouchesChangedAfter(
    touchHistory,
    after,
  );
}

function currentCentroidYOfChanged(
  touchHistory: ITouchHistory,
  after: number,
): number {
  return TouchHistoryMath.currentCentroidYOfTouchesChangedAfter(
    touchHistory,
    after,
  );
}

function previousCentroidXOfChanged(
  touchHistory: ITouchHistory,
  after: number,
): number {
  return TouchHistoryMath.previousCentroidXOfTouchesChangedAfter(
    touchHistory,
    after,
  );
}

function previousCentroidYOfChanged(
  touchHistory: ITouchHistory,
  after: number,
): number {
  return TouchHistoryMath.previousCentroidYOfTouchesChangedAfter(
    touchHistory,
    after,
  );
}

export function currentCentroidXAll(touchHistory: ITouchHistory): number {
  return TouchHistoryMath.currentCentroidX(touchHistory);
}

export function currentCentroidYAll(touchHistory: ITouchHistory): number {
  return TouchHistoryMath.currentCentroidY(touchHistory);
}

// Общий хвост обоих путей: скорость за `dt` кадра, при `dt <= 0` нулевая, не NaN
function advanceGesture(
  gestureState: IPanResponderGestureState,
  nextDx: number,
  nextDy: number,
  frameTimestamp: number,
): void {
  const dt = frameTimestamp - gestureState._accountsForMovesUpTo;
  if (dt > 0) {
    gestureState.vx = (nextDx - gestureState.dx) / dt;
    gestureState.vy = (nextDy - gestureState.dy) / dt;
  } else {
    gestureState.vx = 0;
    gestureState.vy = 0;
  }
  gestureState.dx = nextDx;
  gestureState.dy = nextDy;
  gestureState._accountsForMovesUpTo = frameTimestamp;
}

// `_updateGestureStateOnMove` из RN: копится смещение центроида только сдвинувшихся касаний,
// поэтому остановившийся палец в многопальцевом жесте не вносит вклад в dx
function updateGestureStateFromHistory(
  gestureState: IPanResponderGestureState,
  touchHistory: ITouchHistory,
): void {
  gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
  const movedAfter = gestureState._accountsForMovesUpTo;
  gestureState.moveX = currentCentroidXOfChanged(touchHistory, movedAfter);
  gestureState.moveY = currentCentroidYOfChanged(touchHistory, movedAfter);

  const prevX = previousCentroidXOfChanged(touchHistory, movedAfter);
  const x = currentCentroidXOfChanged(touchHistory, movedAfter);
  const prevY = previousCentroidYOfChanged(touchHistory, movedAfter);
  const y = currentCentroidYOfChanged(touchHistory, movedAfter);
  advanceGesture(
    gestureState,
    gestureState.dx + (x - prevX),
    gestureState.dy + (y - prevY),
    touchHistory.mostRecentTimeStamp,
  );
}

export function initializeGestureState(
  gestureState: IPanResponderGestureState,
): void {
  gestureState.moveX = 0;
  gestureState.moveY = 0;
  gestureState.x0 = 0;
  gestureState.y0 = 0;
  gestureState.dx = 0;
  gestureState.dy = 0;
  gestureState.vx = 0;
  gestureState.vy = 0;
  gestureState.numberActiveTouches = 0;
  gestureState._accountsForMovesUpTo = 0;
}

// Метка кадра: часы банка касаний, иначе самое свежее из живых касаний
export function frameTimestampOf(
  event: ISymbioteEvent,
  touches: ITouchPoint[],
): number {
  return (
    touchHistoryOf(event)?.mostRecentTimeStamp ?? mostRecentTimestamp(touches)
  );
}

// Шаг жеста на кадр движения: с банком касаний по правилам RN, без него по центроиду всех
// касаний, а `dt === 0` даёт нулевую скорость, не NaN
export function updateGestureStateOnMove(
  gestureState: IPanResponderGestureState,
  event: ISymbioteEvent,
  touches: ITouchPoint[],
): void {
  const touchHistory = touchHistoryOf(event);
  if (touchHistory !== undefined) {
    updateGestureStateFromHistory(gestureState, touchHistory);
    return;
  }

  const currentX = centroidX(touches);
  const currentY = centroidY(touches);
  const frameTimestamp = mostRecentTimestamp(touches);

  gestureState.numberActiveTouches = touches.length;
  gestureState.moveX = currentX;
  gestureState.moveY = currentY;

  advanceGesture(
    gestureState,
    currentX - gestureState.x0,
    currentY - gestureState.y0,
    frameTimestamp,
  );
}
