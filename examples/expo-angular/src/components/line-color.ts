import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

export function lineColorOf(route: ITourRouteName): string {
  return LINE_COLOR[ROUTE_LINE_INFO[route].line];
}
