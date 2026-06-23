// ScrollView on Android: an Android ScrollView accepts only ONE child, so a RefreshControl
// can't be a sibling of the content the way iOS allows ("addViewAt: failed to insert view
// ... at index 1"). Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the
// scroll view, with the scroll view nested inside and nestedScrollEnabled so the inner
// scroll handles the gesture before the refresh parent — mirroring RN's ScrollView.js
// android branch (cloneElement(refreshControl, {style}, <ScrollView nestedScrollEnabled
// style={flex:1}>{content}</ScrollView>)). Metro picks this on an Android host; no
// Platform.OS read. See ADR 0020.
// device-verify-pending: the wrap shape mirrors RN, proven on a real host by the absence
// of the "addViewAt: failed to insert" crash.

import { cloneElement, createElement, type FC } from 'react'
import { dlog } from '@symbiote/shared'
import { prepareScrollView, type ScrollViewProps } from './scroll-view-shared'
export type { ScrollViewProps } from './scroll-view-shared'

// The scroll view fills its RefreshControl wrapper; the layout style moved to the wrapper.
const INNER_FILL_STYLE = { flex: 1 }

export const ScrollView: FC<ScrollViewProps> = (props) => {
  const { outerProps, style, content, refreshControl } = prepareScrollView(props)
  dlog('ScrollView.ANDROID refreshControl=' + (refreshControl === undefined ? 'NONE(1child)' : 'WRAP'))

  if (refreshControl === undefined) {
    return createElement('symbiote-scroll-view', { ...outerProps, style }, content)
  }

  // The style goes on the outer RefreshControl (the laid-out box); the inner scroll view
  // fills it. RN splits layout vs visual style across the two; placing the full style on
  // the wrapper plus flex:1 inside is the close-enough shape that keeps the background and
  // sizing correct for the common case.
  const scrollView = createElement(
    'symbiote-scroll-view',
    { ...outerProps, style: INNER_FILL_STYLE, nestedScrollEnabled: true },
    content,
  )
  return cloneElement(refreshControl, { style }, scrollView)
}
