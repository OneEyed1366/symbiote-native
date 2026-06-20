// Button — the minimal cross-platform button, rendered in its iOS shape per RN's
// Button.js: a TouchableOpacity wrapping a Text. On iOS `color` tints the text
// (on Android it would tint the background; iOS-first here). `disabled` greys the
// label and drops the press handler.

import { createElement, type FC } from 'react'
import { Text } from './components'
import { TouchableOpacity } from './touchable'
import type { SymbioteEvent } from '@symbiote/shared'
import type { TextStyle } from './styles'

const IOS_BUTTON_BLUE = '#007AFF'
const IOS_DISABLED_GREY = '#cdcdcd'

const buttonTextStyle: TextStyle = {
  color: IOS_BUTTON_BLUE,
  textAlign: 'center',
  padding: 8,
  fontSize: 18,
}

// RN's Button is `accessibilityRole="button"`; the role string is a native
// accessibility enum value, fine inline.
const BUTTON_ACCESSIBILITY_ROLE = 'button'

export interface ButtonProps {
  title: string
  onPress?: (event: SymbioteEvent) => void
  color?: string
  disabled?: boolean
  accessibilityLabel?: string
}

export const Button: FC<ButtonProps> = (props) => {
  const { title, onPress, color, disabled, accessibilityLabel } = props

  const textStyle: TextStyle = { ...buttonTextStyle }
  if (color !== undefined) textStyle.color = color
  if (disabled === true) textStyle.color = IOS_DISABLED_GREY

  // RN's Button sets role=button, is accessible, and propagates the disabled
  // accessibility state (Button.js: accessibilityRole="button",
  // accessible={accessible}, accessibilityState={_accessibilityState}).
  return createElement(
    TouchableOpacity,
    {
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityRole: BUTTON_ACCESSIBILITY_ROLE,
      accessible: true,
      accessibilityState: { disabled },
    },
    createElement(Text, { style: textStyle }, title),
  )
}
