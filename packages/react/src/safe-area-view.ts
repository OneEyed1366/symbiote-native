// SafeAreaView primitive. A plain view whose native side insets its children to
// the safe area (notch, rounded corners, system bars). There is no JS-side
// translation — RN just renders the native RCTSafeAreaView and lets the host do
// the inset math — so this maps style + children straight onto the intrinsic.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

export interface SafeAreaViewProps {
  style?: ViewStyle
  children?: ReactNode
  // Standard ViewProps, forwarded onto the native safe-area node.
  testID?: string
  accessibilityLabel?: string
  accessible?: boolean
  onLayout?: (event: SymbioteEvent) => void
}

export const SafeAreaView: FC<SafeAreaViewProps> = (props) => {
  const { style, children, testID, accessibilityLabel, accessible, onLayout } = props

  dlog('SafeAreaView -> SafeAreaView')

  const nodeProps: Record<string, unknown> = { style }
  if (testID !== undefined) nodeProps.testID = testID
  if (accessibilityLabel !== undefined) nodeProps.accessibilityLabel = accessibilityLabel
  if (accessible !== undefined) nodeProps.accessible = accessible
  if (onLayout !== undefined) nodeProps.onLayout = onLayout

  return createElement('symbiote-safe-area-view', nodeProps, children)
}
