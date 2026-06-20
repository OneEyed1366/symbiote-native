// The Touchable* family, all built on Pressable. RN realizes their feedback with
// Animated; we have no Animated, so we approximate by toggling a static style on
// the pressed state (Pressable already drives `pressed` for us):
//   TouchableOpacity   — lower the wrapper's opacity while pressed.
//   TouchableHighlight — paint underlayColor as the background while pressed.
//   TouchableWithoutFeedback — no visual change, just the press wiring.

import { createElement, type FC, type ReactNode } from 'react'
import { Pressable, type PressableProps, type PressState } from './pressable'
import type { ViewStyle } from './styles'

// Defaults ported from RN's Touchable sources.
const DEFAULT_ACTIVE_OPACITY = 0.2
const DEFAULT_HIGHLIGHT_CHILD_OPACITY = 0.85
const DEFAULT_UNDERLAY_COLOR = 'black'

type TouchableBaseProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: ViewStyle
  children?: ReactNode
}

export interface TouchableOpacityProps extends TouchableBaseProps {
  activeOpacity?: number
}

export const TouchableOpacity: FC<TouchableOpacityProps> = (props) => {
  const { activeOpacity = DEFAULT_ACTIVE_OPACITY, style, children, ...rest } = props

  function pressedStyle({ pressed }: PressState): ViewStyle {
    if (!pressed) return { ...style }
    return { ...style, opacity: activeOpacity }
  }

  return createElement(Pressable, { ...rest, style: pressedStyle }, children)
}

export interface TouchableHighlightProps extends TouchableBaseProps {
  activeOpacity?: number
  underlayColor?: string
}

export const TouchableHighlight: FC<TouchableHighlightProps> = (props) => {
  const {
    activeOpacity = DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    underlayColor = DEFAULT_UNDERLAY_COLOR,
    style,
    children,
    ...rest
  } = props

  function pressedStyle({ pressed }: PressState): ViewStyle {
    if (!pressed) return { ...style }
    return { ...style, backgroundColor: underlayColor, opacity: activeOpacity }
  }

  return createElement(Pressable, { ...rest, style: pressedStyle }, children)
}

export interface TouchableWithoutFeedbackProps extends TouchableBaseProps {}

export const TouchableWithoutFeedback: FC<TouchableWithoutFeedbackProps> = (props) => {
  const { children, ...rest } = props
  return createElement(Pressable, rest, children)
}
