// ActivityIndicator primitive. RN wraps the native spinner in a centering View
// and translates `size` in JS: the 'small'/'large' strings map to a native size
// enum AND a fixed wrapper-less box style, while a numeric size never reaches
// native (it's iOS-unsupported there) and instead sizes the spinner via style.
// That JS translation lives here, exactly as RN's own ActivityIndicator.js does,
// so the native side only ever sees the enum it understands.

import { createElement, type FC } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

type ActivityIndicatorSize = 'small' | 'large' | number

// RN's default spinner color on iOS (Libraries/.../ActivityIndicator.js GRAY).
const DEFAULT_COLOR = '#999999'

// Fixed pixel boxes RN gives the two named sizes (styles.sizeSmall/sizeLarge).
const SIZE_SMALL_PX = 20
const SIZE_LARGE_PX = 36

// Centering wrapper RN puts around the spinner (styles.container).
const CONTAINER_STYLE: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
}

export interface ActivityIndicatorProps {
  animating?: boolean
  color?: string
  size?: ActivityIndicatorSize
  hidesWhenStopped?: boolean
  style?: ViewStyle
  // Standard ViewProps. RN spreads `...props` onto the centering wrapper View, so
  // these land on the wrapper, not the spinner.
  testID?: string
  accessibilityLabel?: string
  accessible?: boolean
  onLayout?: (event: SymbioteEvent) => void
}

interface NativeSize {
  // Style applied to the spinner node so it occupies the right box.
  sizeStyle: ViewStyle
  // Native size enum — only the string sizes have one; numeric stays undefined.
  sizeProp?: 'small' | 'large'
}

function resolveSize(size: ActivityIndicatorSize): NativeSize {
  if (size === 'small') {
    return { sizeStyle: { width: SIZE_SMALL_PX, height: SIZE_SMALL_PX }, sizeProp: 'small' }
  }
  if (size === 'large') {
    return { sizeStyle: { width: SIZE_LARGE_PX, height: SIZE_LARGE_PX }, sizeProp: 'large' }
  }
  return { sizeStyle: { width: size, height: size } }
}

export const ActivityIndicator: FC<ActivityIndicatorProps> = (props) => {
  const {
    animating = true,
    color = DEFAULT_COLOR,
    hidesWhenStopped = true,
    size = 'small',
    style,
    testID,
    accessibilityLabel,
    accessible,
    onLayout,
  } = props

  const { sizeStyle, sizeProp } = resolveSize(size)
  dlog(
    sizeProp !== undefined
      ? `ActivityIndicator size '${sizeProp}' -> native size enum '${sizeProp}'`
      : `ActivityIndicator size ${String(size)} -> style only, native size not set`,
  )

  const nativeProps: Record<string, unknown> = {
    animating,
    color,
    hidesWhenStopped,
    style: sizeStyle,
  }
  if (sizeProp !== undefined) nativeProps.size = sizeProp

  dlog('ActivityIndicator -> RCTView(ActivityIndicatorView)')

  const wrapperProps: Record<string, unknown> = { style: { ...CONTAINER_STYLE, ...style } }
  if (testID !== undefined) wrapperProps.testID = testID
  if (accessibilityLabel !== undefined) wrapperProps.accessibilityLabel = accessibilityLabel
  if (accessible !== undefined) wrapperProps.accessible = accessible
  if (onLayout !== undefined) wrapperProps.onLayout = onLayout

  return createElement(
    'symbiote-view',
    wrapperProps,
    createElement('symbiote-activity-indicator', nativeProps),
  )
}
