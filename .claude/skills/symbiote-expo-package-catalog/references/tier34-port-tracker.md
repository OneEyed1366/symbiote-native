# Tier 3 + 4 demo screens: port tracker

Reference: `examples/expo-react` (device-tested). Target: solid, svelte, vue-sfc, vue-tsx, angular.
Per example, one-off registration for all 11 routes: `routes.ts`, `navigation-lines.ts`, menu hints,
`App.css` line classes, `ExpoViews.css` (layout classes of the screens), `package.json` deps.
Per screen: the screen file(s) + its entry in the screen table. Full parity: every scenario,
testID and row of the React screen.

Legend: `-` not started, `reg` registration done, `T` parity test green (typecheck needs registry:sync).

| Screen | solid | svelte | vue-sfc | vue-tsx | angular |
|---|---|---|---|---|---|
| Checkbox | T | T | T | T | T |
| LinearGradient | T | T | T | T | T |
| Blur | T | T | T | T | T |
| GlassEffect | T | T | T | T | T |
| Symbols | T | T | T | T | T |
| AppleAuthentication | T | T | T | T | T |
| Image | T | T | T | T | T |
| Video | T | T | T | T | T |
| Camera | T | T | T | T | T |
| LivePhoto | T | T | T | T | T |
| Gl | T | T | T | T | T |

| Registration (11 routes) | solid | svelte | vue-sfc | vue-tsx | angular |
|---|---|---|---|---|---|
| routes + lines + menu + css + deps | reg | reg | reg | reg | reg |
