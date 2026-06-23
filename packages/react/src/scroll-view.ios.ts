// ScrollView on iOS: the RefreshControl is a CHILD of the scroll view, rendered as a
// sibling BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// Also the base (scroll-view.ts re-exports it) for headless / web. See ADR 0020.

import { createElement, type FC } from 'react'
import { prepareScrollView, type ScrollViewProps } from './scroll-view-shared'
export type { ScrollViewProps } from './scroll-view-shared'

export const ScrollView: FC<ScrollViewProps> = (props) => {
  const { outerProps, style, content, refreshControl } = prepareScrollView(props)
  const scrollProps = { ...outerProps, style }

  if (refreshControl === undefined) {
    return createElement('symbiote-scroll-view', scrollProps, content)
  }
  return createElement('symbiote-scroll-view', scrollProps, refreshControl, content)
}
