// RefreshControl primitive. On iOS this is the PullToRefreshView Fabric node that
// lives INSIDE a ScrollView (a sibling of the content container), giving the
// pull-to-refresh gesture. `refreshing` is a controlled prop — the parent owns it
// and pushes it down each commit; native reports the gesture via the direct
// `topRefresh` event, which shared routes to the `refresh` listener (onRefresh).

import { createElement, type FC, type ReactNode } from 'react'
import { dlog } from '@symbiote/shared'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'

export interface RefreshControlProps extends AccessibilityProps, AriaProps {
  refreshing: boolean
  // RN's onRefresh is `() => void | Promise<void>` — the handler may be async; the
  // promise is fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>
  tintColor?: string
  title?: string
  titleColor?: string
  progressViewOffset?: number
  // Android-only. RN's iOS RefreshControl.render() destructures `enabled` OUT
  // before spreading to PullToRefreshView, so iOS native never receives it. We
  // target PullToRefreshView (iOS-first), so it is stripped below, not forwarded.
  enabled?: boolean
  // On Android the RefreshControl WRAPS the ScrollView (ADR 0020), so it receives the
  // scroll view as its child via cloneElement. On iOS it is a childless sibling, so this
  // is undefined there — passing it through is harmless.
  children?: ReactNode
}

export const RefreshControl: FC<RefreshControlProps> = (rawProps) => {
  // Owns its host element (symbiote-refresh-control), so it folds aria/role here;
  // the resolved accessibility* fields ride down via `...nativeProps`.
  const props = resolveAccessibilityProps(rawProps)
  const { enabled: _enabled, children, ...nativeProps } = props
  dlog('RefreshControl -> PullToRefreshView')
  dlog(`RefreshControl refreshing=${String(props.refreshing)}`)
  if (props.onRefresh !== undefined) dlog('RefreshControl onRefresh listener wired')
  return createElement('symbiote-refresh-control', { ...nativeProps }, children)
}
