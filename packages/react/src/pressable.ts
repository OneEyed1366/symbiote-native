// Pressable — the userland interaction primitive. It composes a single View and
// the press/pressIn/pressOut listeners that shared synthesizes on the responder
// node; there is no new native view and no core change. `pressed` is JS state:
// pressIn sets it true, pressOut sets it false, so style/children can react to it.
// onLongPress has no native event — it is synthesized with a timer armed on
// pressIn and disarmed on pressOut/press, matching RN's Pressability behavior.

import { createElement, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import { View } from './components'
import type { ViewStyle } from './styles'

const DEFAULT_DELAY_LONG_PRESS_MS = 500

export interface PressState {
  pressed: boolean
}

type PressHandler = (event: SymbioteEvent) => void
type StyleProp = ViewStyle | ((state: PressState) => ViewStyle)
type ChildrenProp = ReactNode | ((state: PressState) => ReactNode)

// The accessibility state RN forwards to the native view. Only `disabled` is
// modelled for now (View + Text scope); RN's full shape adds busy/checked/etc.
export interface AccessibilityState {
  disabled?: boolean
}

export interface PressableProps {
  onPress?: PressHandler
  onPressIn?: PressHandler
  onPressOut?: PressHandler
  onLongPress?: PressHandler
  delayLongPress?: number
  disabled?: boolean
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number }
  accessibilityLabel?: string
  accessibilityRole?: string
  accessibilityState?: AccessibilityState
  accessible?: boolean
  testID?: string
  style?: StyleProp
  children?: ChildrenProp
}

function resolveStyle(style: StyleProp | undefined, state: PressState): ViewStyle | undefined {
  if (typeof style === 'function') return style(state)
  return style
}

function resolveChildren(children: ChildrenProp | undefined, state: PressState): ReactNode {
  if (typeof children === 'function') return children(state)
  return children
}

export const Pressable: FC<PressableProps> = (props) => {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onLongPress,
    delayLongPress = DEFAULT_DELAY_LONG_PRESS_MS,
    disabled,
    hitSlop,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    accessible,
    testID,
    style,
    children,
  } = props

  const [pressed, setPressed] = useState(false)
  // Holds the in-flight long-press timer between pressIn and pressOut/press; a
  // ref (not state) so arming/disarming it never triggers a re-render.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handlers = useMemo(() => {
    function clearLongPress(): void {
      if (longPressTimer.current !== undefined) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = undefined
      }
    }

    return {
      handlePressIn(event: SymbioteEvent): void {
        dlog('Pressable pressIn')
        setPressed(true)
        if (onLongPress) {
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = undefined
            dlog('Pressable longPress timer fired')
            onLongPress(event)
          }, delayLongPress)
        }
        onPressIn?.(event)
      },
      handlePressOut(event: SymbioteEvent): void {
        dlog('Pressable pressOut')
        clearLongPress()
        setPressed(false)
        onPressOut?.(event)
      },
      handlePress(event: SymbioteEvent): void {
        dlog('Pressable press')
        clearLongPress()
        onPress?.(event)
      },
    }
  }, [onPress, onPressIn, onPressOut, onLongPress, delayLongPress])

  const state: PressState = { pressed }

  // RN merges `disabled` into the resolved accessibilityState so a disabled
  // Pressable reports the disabled state even if the caller passed none
  // (Pressable.js: `disabled != null ? {...state, disabled} : state`).
  const resolvedAccessibilityState: AccessibilityState | undefined =
    disabled !== undefined ? { ...accessibilityState, disabled } : accessibilityState

  const viewProps: Record<string, unknown> = {
    style: resolveStyle(style, state),
    hitSlop,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState: resolvedAccessibilityState,
    accessible,
    testID,
  }
  // When disabled, leave the listeners off entirely — a press never fires and
  // pressed-state never flips, exactly as RN's disabled Pressable.
  if (disabled !== true) {
    viewProps.onPress = handlers.handlePress
    viewProps.onPressIn = handlers.handlePressIn
    viewProps.onPressOut = handlers.handlePressOut
  } else {
    dlog('Pressable disabled — listeners suppressed')
  }

  return createElement(View, viewProps, resolveChildren(children, state))
}
