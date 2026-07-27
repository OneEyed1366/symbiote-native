// Route-name constants shared between App.ts's <ng-template symbioteScreen name="..."> registrations
// and every screen's navigation.push(...)/navigation.jumpTo(...) calls — a single source of truth so
// a typo can't silently create a dead route on one side only. Byte-identical to the React canary's
// routes.ts (../react/routes.ts) — the route surface is framework-agnostic, only the wiring differs.

export const ROUTE_NAME = {
  Menu: 'Menu',
  Sensors: 'Sensors',
  LocalAuth: 'LocalAuth',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
