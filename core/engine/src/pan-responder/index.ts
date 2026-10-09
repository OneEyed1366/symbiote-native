// PanResponder: reconciles responder events into one accumulative gesture behind `panHandlers`
// TODO(rn-port): a copy of RN's `PanResponder.js`, RN reads `event.touchHistory`, breaks without
// Ours reads `nativeEvent.touchHistory` and falls back to `nativeEvent.touches`

import { dlog } from '../debug';
import type { ISymbioteEvent } from '../node';
import {
  centroidX,
  centroidY,
  currentCentroidXAll,
  currentCentroidYAll,
  frameTimestampOf,
  initializeGestureState,
  readTouches,
  touchHistoryOf,
  updateGestureStateOnMove,
} from './gesture-math';
import type { IPanResponderGestureState } from './gesture-math';

export type { IPanResponderGestureState };

// (event, gestureState) -> boolean: the should-set / termination-request gate.
type IActiveCallback = (
  event: ISymbioteEvent,
  gestureState: IPanResponderGestureState,
) => boolean;
// (event, gestureState) -> void: grant / move / release / terminate side effects.
type IPassiveCallback = (
  event: ISymbioteEvent,
  gestureState: IPanResponderGestureState,
) => void;

// `null` значит то же, что отсутствие колбэка, как в RN
export type IPanResponderCallbacks = {
  onStartShouldSetPanResponder?: IActiveCallback | null;
  onStartShouldSetPanResponderCapture?: IActiveCallback | null;
  onMoveShouldSetPanResponder?: IActiveCallback | null;
  onMoveShouldSetPanResponderCapture?: IActiveCallback | null;
  onPanResponderGrant?: IPassiveCallback | IActiveCallback | null;
  onPanResponderStart?: IPassiveCallback | null;
  onPanResponderMove?: IPassiveCallback | null;
  onPanResponderEnd?: IPassiveCallback | null;
  onPanResponderRelease?: IPassiveCallback | null;
  onPanResponderReject?: IPassiveCallback | null;
  onPanResponderTerminate?: IPassiveCallback | null;
  onPanResponderTerminationRequest?: IActiveCallback | null;
  onShouldBlockNativeResponder?: IActiveCallback | null;
};

// The responder props PanResponder produces, handed to a primitive as `panHandlers`.
//
// A `type` and not an `interface` on purpose: an interface gets no implicit index signature, so it
// is not assignable to a `Record<string, unknown>` — and that is exactly what the Svelte shim's
// bag prop takes. Declared as an interface, `p={panResponder.panHandlers}` is a type error while
// the identical object literal is fine.
export type IGestureResponderHandlers = {
  onStartShouldSetResponder: (event: ISymbioteEvent) => boolean;
  onStartShouldSetResponderCapture: (event: ISymbioteEvent) => boolean;
  onMoveShouldSetResponder: (event: ISymbioteEvent) => boolean;
  onMoveShouldSetResponderCapture: (event: ISymbioteEvent) => boolean;
  onResponderGrant: (event: ISymbioteEvent) => boolean;
  onResponderReject: (event: ISymbioteEvent) => void;
  onResponderStart: (event: ISymbioteEvent) => void;
  onResponderMove: (event: ISymbioteEvent) => void;
  onResponderEnd: (event: ISymbioteEvent) => void;
  onResponderRelease: (event: ISymbioteEvent) => void;
  onResponderTerminate: (event: ISymbioteEvent) => void;
  onResponderTerminationRequest: (event: ISymbioteEvent) => boolean;
};

export type IPanResponderInstance = {
  panHandlers: IGestureResponderHandlers;
  getInteractionHandle: () => number | null;
};

const SINGLE_TOUCH_COUNT = 1;
// onShouldBlockNativeResponder defaults to true (RN: block native by default).
const DEFAULT_BLOCK_NATIVE_RESPONDER = true;

type IShouldSetHandlers = Pick<
  IGestureResponderHandlers,
  | 'onStartShouldSetResponder'
  | 'onMoveShouldSetResponder'
  | 'onStartShouldSetResponderCapture'
  | 'onMoveShouldSetResponderCapture'
  | 'onResponderTerminationRequest'
>;

type IGrantHandlers = Pick<
  IGestureResponderHandlers,
  'onResponderGrant' | 'onResponderReject' | 'onResponderStart'
>;

type IProgressHandlers = Pick<
  IGestureResponderHandlers,
  | 'onResponderMove'
  | 'onResponderEnd'
  | 'onResponderRelease'
  | 'onResponderTerminate'
>;

function createGestureState(): IPanResponderGestureState {
  return {
    // Случайный id жеста, как в RN, нужен только для отладки
    stateID: Math.random(),
    moveX: 0,
    moveY: 0,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    numberActiveTouches: 0,
    _accountsForMovesUpTo: 0,
  };
}

// Решают, станет ли жест респондером, и принимают или отклоняют перехват
function createShouldSetHandlers(
  config: IPanResponderCallbacks,
  gestureState: IPanResponderGestureState,
): IShouldSetHandlers {
  return {
    onStartShouldSetResponder(event: ISymbioteEvent): boolean {
      const wants =
        config.onStartShouldSetPanResponder == null
          ? false
          : config.onStartShouldSetPanResponder(event, gestureState);
      dlog(`PanResponder startShouldSet -> ${wants}`);
      return wants;
    },

    onMoveShouldSetResponder(event: ISymbioteEvent): boolean {
      return config.onMoveShouldSetPanResponder == null
        ? false
        : config.onMoveShouldSetPanResponder(event, gestureState);
    },

    onStartShouldSetResponderCapture(event: ISymbioteEvent): boolean {
      // Новое одиночное касание начинает жест, поэтому сбрасываем накопитель до should-set
      const touches = readTouches(event);
      if (touches.length === SINGLE_TOUCH_COUNT) {
        initializeGestureState(gestureState);
      }
      gestureState.numberActiveTouches =
        touchHistoryOf(event)?.numberActiveTouches ?? touches.length;
      return config.onStartShouldSetPanResponderCapture == null
        ? false
        : config.onStartShouldSetPanResponderCapture(event, gestureState);
    },

    onMoveShouldSetResponderCapture(event: ISymbioteEvent): boolean {
      const touches = readTouches(event);
      // Один кадр с двумя изменившимися касаниями приходит дважды, геометрия уже учтена
      if (
        gestureState._accountsForMovesUpTo === frameTimestampOf(event, touches)
      ) {
        return false;
      }
      updateGestureStateOnMove(gestureState, event, touches);
      return config.onMoveShouldSetPanResponderCapture == null
        ? false
        : config.onMoveShouldSetPanResponderCapture(event, gestureState);
    },

    onResponderTerminationRequest(event: ISymbioteEvent): boolean {
      return config.onPanResponderTerminationRequest == null
        ? true
        : config.onPanResponderTerminationRequest(event, gestureState);
    },
  };
}

function grantHandlers(
  config: IPanResponderCallbacks,
  gestureState: IPanResponderGestureState,
): IGrantHandlers {
  return {
    onResponderGrant(event: ISymbioteEvent): boolean {
      dlog('PanResponder grant');
      const touches = readTouches(event);
      const touchHistory = touchHistoryOf(event);
      // x0/y0 - некумулятивный центроид в момент grant
      gestureState.x0 = touchHistory
        ? currentCentroidXAll(touchHistory)
        : centroidX(touches);
      gestureState.y0 = touchHistory
        ? currentCentroidYAll(touchHistory)
        : centroidY(touches);
      gestureState.dx = 0;
      gestureState.dy = 0;
      // С банком касаний метку кадра и счётчик ведут capture и move, как в RN
      // Без банка кадр grant учитывается, иначе скорость первого move считалась бы от 0
      if (touchHistory === undefined) {
        gestureState._accountsForMovesUpTo = frameTimestampOf(event, touches);
        gestureState.numberActiveTouches = touches.length;
      }
      config.onPanResponderGrant?.(event, gestureState);
      return config.onShouldBlockNativeResponder == null
        ? DEFAULT_BLOCK_NATIVE_RESPONDER
        : config.onShouldBlockNativeResponder(event, gestureState);
    },

    onResponderReject(event: ISymbioteEvent): void {
      config.onPanResponderReject?.(event, gestureState);
    },

    onResponderStart(event: ISymbioteEvent): void {
      gestureState.numberActiveTouches =
        touchHistoryOf(event)?.numberActiveTouches ?? readTouches(event).length;
      config.onPanResponderStart?.(event, gestureState);
    },
  };
}

function progressHandlers(
  config: IPanResponderCallbacks,
  gestureState: IPanResponderGestureState,
): IProgressHandlers {
  return {
    onResponderMove(event: ISymbioteEvent): void {
      const touches = readTouches(event);
      const frame = frameTimestampOf(event, touches);
      // Тот же страж дубля кадра, что и в capture, лог нужен: стоящий кадр глушит все move
      if (gestureState._accountsForMovesUpTo === frame) {
        dlog(
          `PanResponder move SWALLOWED frame=${frame} touches=${touches.length} history=${touchHistoryOf(event) === undefined ? 'none' : 'yes'}`,
        );
        return;
      }
      updateGestureStateOnMove(gestureState, event, touches);
      dlog(
        `PanResponder move frame=${frame} dx=${gestureState.dx} dy=${gestureState.dy}`,
      );
      config.onPanResponderMove?.(event, gestureState);
    },

    onResponderEnd(event: ISymbioteEvent): void {
      gestureState.numberActiveTouches =
        touchHistoryOf(event)?.numberActiveTouches ?? readTouches(event).length;
      config.onPanResponderEnd?.(event, gestureState);
    },

    onResponderRelease(event: ISymbioteEvent): void {
      dlog('PanResponder release');
      config.onPanResponderRelease?.(event, gestureState);
      initializeGestureState(gestureState);
    },

    onResponderTerminate(event: ISymbioteEvent): void {
      dlog('PanResponder terminate');
      config.onPanResponderTerminate?.(event, gestureState);
      initializeGestureState(gestureState);
    },
  };
}

const PanResponder = {
  create(config: IPanResponderCallbacks): IPanResponderInstance {
    const gestureState = createGestureState();
    return {
      panHandlers: {
        ...createShouldSetHandlers(config, gestureState),
        ...grantHandlers(config, gestureState),
        ...progressHandlers(config, gestureState),
      },
      // Deprecated в RN, оставлен ради формы, дескриптора InteractionManager нет
      getInteractionHandle(): number | null {
        return null;
      },
    };
  },
};

export default PanResponder;
