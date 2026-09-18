#include "SymbioteFabricProps.h"

#include "SymbioteDebug.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <variant>
#include <vector>

#include <react/renderer/css/CSSColor.h>
#include <react/renderer/css/CSSValueParser.h>

namespace symbiote {

using folly::dynamic;

namespace {

// ── WHAT THIS MIRRORS AND WHAT IT DELIBERATELY DOES NOT ──────────────────────────────────────────
//
// `core/engine/src/fabric-props.ts` is the reference. Ported here: the raw-text short circuit, the
// aria/role fold, the component-keyed `value` -> `text` fold, the behavior's own fold (CALLED, in
// JS — see `IPayloadFold` and `foldFor` in `SymbioteTree.cpp`), the top-level walk, and the style
// hoist. Two things are NOT, and each is a decision rather than a gap:
//
//   the ViewConfig-derived processor registry (`registeredProcessor`) — populated in JS from RN's
//   `ReactNativeViewConfigRegistry` at first use, per third-party component. Our own primitives are
//   never in it (`resolve()` short-circuits every builtin to EMPTY), so omitting it costs only a
//   community view's own `validAttributes[*].process`, and the colour half of that is covered by
//   `kColorProps` below wherever the names coincide.
//
//   the structured CSS style processors (boxShadow / filter / transform / transformOrigin /
//   aspectRatio / fontVariant / experimental_backgroundImage). NOT a gap any more, and no longer
//   something to port: they run at WRITE time in `core/engine/src/structured-style.ts`, so the value
//   in `node.props` is already structured whichever builder reads it. They were resolved in the
//   reference only for a while, which meant they were resolved HEADLESS only — a CSS-string
//   `experimental_backgroundImage` reached Fabric as a string and was dropped in silence, since
//   `enableNativeCSSParsing()` is false. Porting them here would have been a second implementation
//   of seven parsers; moving them one step earlier costs none.
//
// ── THE TWO INPUTS THE REFERENCE READS OFF THE NODE, AND WHERE THEY WENT ─────────────────────────
//
//   `node.component` crosses already, as the `OP_CREATE_ELEMENT` string and `OP_SET_COMPONENT`.
//   `node.hasAriaAlias` is RECOMPUTED — see `hasAriaAlias` below. It is a memo, not a fact.
//
// ── TWO THINGS THE WIRE ALREADY DECIDED, SO THEY NEED NO CODE HERE ───────────────────────────────
//
//   The reference skips function-valued props. A function cannot be in this bag at all:
//   `routeProp` diverts every `on*` callback to `setEventListener`, and `jsi::dynamicFromValue`
//   throws on one regardless. The reference also skips `undefined`-valued props; `recordSetProp`
//   encodes `undefined` as `NO_VALUE`, which ERASES the key, so no such value ever arrives.

constexpr const char *kRawTextComponent = "RCTRawText";
// RN's two Text defaults live on THIS component and not on raw text — see `applyTextDefaults`.
constexpr const char *kTextComponent = "RCTText";
// Android's switch is its OWN Fabric component with its own prop names (`on`/`enabled` rather than
// `value`/`disabled`), which is what lets `foldSwitchProps` branch on the name instead of `#ifdef`.
constexpr const char *kAndroidSwitchComponent = "AndroidSwitch";
constexpr const char *kSinglelineTextInput = "RCTSinglelineTextInputView";
constexpr const char *kMultilineTextInput = "RCTMultilineTextInputView";

// Colour props must reach Fabric as platform ints. `fromRawValueShared.h` parses a CSS STRING only
// when `enableNativeCSSParsing()` is on, and it defaults to FALSE — an unparsed string falls
// through to `parsePlatformColor`, which looks for a SEMANTIC name and quietly yields nothing for
// `#ff0000`. Copied name for name from the reference's COLOR_PROPS; a name added there and not here
// is a colour that silently stops painting on device only.
//
// This list covers OUR OWN primitives, whose style colours reach no ViewConfig — `resolve()`
// short-circuits every builtin to EMPTY. A third-party view's colour props are NOT its business and
// must never be added here: those are declared by the view's own `validAttributes[*].process`, and
// `configPayloadFold` applies them in JS before this file ever sees the bag.
const std::unordered_set<std::string> kColorProps = {
    "backgroundColor",
    "color",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderStartColor",
    "borderEndColor",
    "borderBlockColor",
    "borderBlockStartColor",
    "borderBlockEndColor",
    "shadowColor",
    "textShadowColor",
    "overlayColor",
    "outlineColor",
    "tintColor",
    "placeholderTextColor",
    "selectionColor",
    "cursorColor",
    "underlineColorAndroid",
    "textDecorationColor",
    "selectionHandleColor",
    "onTintColor",
    "thumbTintColor",
    "trackColorForTrue",
    "trackColorForFalse",
    "trackTintColor",
};

// ── COLOUR ───────────────────────────────────────────────────────────────────────────────────────

std::optional<int> hexDigit(char character) {
  if (character >= '0' && character <= '9') return character - '0';
  if (character >= 'a' && character <= 'f') return character - 'a' + 10;
  if (character >= 'A' && character <= 'F') return character - 'A' + 10;
  return std::nullopt;
}

std::optional<uint32_t> parseHexColor(std::string_view text) {
  std::vector<int> digits;
  digits.reserve(text.size());
  for (char character : text) {
    auto digit = hexDigit(character);
    if (!digit.has_value()) return std::nullopt;
    digits.push_back(*digit);
  }
  auto pair = [&](size_t at) { return static_cast<uint32_t>(digits[at] * 16 + digits[at + 1]); };
  auto twice = [&](size_t at) { return static_cast<uint32_t>(digits[at] * 17); };
  switch (digits.size()) {
    case 3:
      return 0xFF000000u | (twice(0) << 16) | (twice(1) << 8) | twice(2);
    case 4:
      return (twice(3) << 24) | (twice(0) << 16) | (twice(1) << 8) | twice(2);
    case 6:
      return 0xFF000000u | (pair(0) << 16) | (pair(2) << 8) | pair(4);
    case 8:
      return (pair(6) << 24) | (pair(0) << 16) | (pair(2) << 8) | pair(4);
    default:
      return std::nullopt;
  }
}

/**
 * Every spelling the hex fast path above does not claim: `rgb()` and `rgba()` in both the
 * comma and space forms, `hsl()`, `hwb()`, `color()`, and the named colours — `transparent`
 * among them, which is why this file no longer special-cases it.
 *
 * This is React Native's OWN colour grammar, the one `fromRawValueShared.h` reaches for when
 * `enableNativeCSSParsing()` is on. It is header-only out of `React-renderercss`, which
 * `install_modules_dependencies` already puts on this pod, so it costs a dependency we have and
 * spares the build a second hand-rolled CSS parser to keep in step with the first.
 *
 * The ceiling this replaces was real and cost a day on device: a chip list coloured with
 * `hsl(...)` passed through as a STRING, and `PlatformColorParser.mm` answers a string with
 * `clearColor()` — so every chip painted transparent, on all five adapters at once, while every
 * headless test stayed green because the JS applier stores a prop value and never converts it.
 */
std::optional<uint32_t> parseCssColor(const std::string &text) {
  using facebook::react::CSSColor;
  const auto parsed = facebook::react::parseCSSProperty<CSSColor>(text);
  if (!std::holds_alternative<CSSColor>(parsed)) return std::nullopt;
  const CSSColor color = std::get<CSSColor>(parsed);
  return (static_cast<uint32_t>(color.a) << 24) | (static_cast<uint32_t>(color.r) << 16) |
      (static_cast<uint32_t>(color.g) << 8) | static_cast<uint32_t>(color.b);
}

/**
 * The colour half of the reference's `processValue`, minus the injected `processColor`.
 *
 * WHAT PASSES THROUGH UNTOUCHED, AND WHY THAT IS THE SAFE DIRECTION. A number is already a platform
 * int. An OPAQUE colour (`PlatformColor` / `DynamicColorIOS`, an object carrying `semantic` or
 * `dynamic`) is exactly what `PlatformColorParser.mm` reads out of a `RawValue`, so handing it over
 * verbatim is more faithful than routing it through JS. A string the grammar cannot parse is not a
 * colour at all, and passing it on leaves the platform to say so.
 *
 * Hex keeps its own parser rather than going through the tokenizer: it is the spelling nearly every
 * style uses, this runs per colour key per node per commit, and it is twenty lines.
 */
dynamic processColorValue(const dynamic &value) {
  if (!value.isString()) return value;
  const std::string &text = value.getString();
  const std::optional<uint32_t> parsed = (!text.empty() && text[0] == '#')
      ? parseHexColor(std::string_view(text).substr(1))
      : parseCssColor(text);
  if (!parsed.has_value()) return value;
  // Widened rather than reinterpreted: RN's `processColor` yields an UNSIGNED 32-bit ARGB, and
  // `fromRawValueShared` reads it back as `(int64_t)value` before shifting. A signed narrowing here
  // would make every colour with alpha 0x80 or above negative.
  return dynamic(static_cast<int64_t>(*parsed));
}

dynamic processValue(const std::string &key, const dynamic &value) {
  if (kColorProps.count(key) == 0) return value;
  return processColorValue(value);
}

// ── STYLE ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Hoist one style slot's keys into the payload being built, recursing on POSITION only — the same
 * rule `flattenStyle` follows, and for the same reason: `transform: [{translateX: 5}]` is an
 * array-VALUED prop, not a nested style.
 *
 * There is no intermediate object, which is the shape React Native itself uses
 * (`ReactNativeAttributePayload.addNestedProperty`); its `flattenStyle` appears only on the UPDATE
 * path. The reference's identity-keyed memo has no counterpart here and cannot have one: the bag is
 * a `folly::dynamic` copied off the JSI value, so a style object shared by a thousand rows arrives
 * as a thousand distinct values. The work that memo saved is a per-key copy plus, for a colour, one
 * parse — bounded by style keys per node, not by the tree.
 *
 * Later entries win, because a later write overwrites the same key.
 *
 * A NULL-valued style key ERASES instead. The reference distinguishes `undefined` (erase, so a
 * later entry can clear an earlier one) from `null` (write, meaning reset to the default), and this
 * side cannot: `jsi::dynamicFromValue` collapses both to null. Erasing is the resolvable half — it
 * keeps the documented clearing behaviour, and it is output-equivalent for the `null` case anyway,
 * since an absent key and an explicit null both leave Fabric on the default in a create payload,
 * while `diffProps` re-sends the vanished key as an explicit null on the clone path.
 */
void addStyle(dynamic &out, const dynamic &style) {
  if (style.isArray()) {
    for (const auto &entry : style) addStyle(out, entry);
    return;
  }
  if (!style.isObject()) return;
  for (const auto &pair : style.items()) {
    if (!pair.first.isString()) continue;
    const std::string &key = pair.first.getString();
    if (pair.second.isNull()) {
      out.erase(key);
      continue;
    }
    out[key] = processValue(key, pair.second);
  }
}

/**
 * The last value a (possibly nested) style slot holds for `key`, or null.
 *
 * LAST rather than first: `addStyle` writes in order and a later entry wins, so this has to agree
 * with what the hoist will do or the two disagree about what the style says. Used only by the image
 * rule, which accepts `resizeMode` and `tintColor` as style keys as well as props.
 */
const dynamic *lastStyleValue(const dynamic &style, const char *key) {
  if (style.isArray()) {
    const dynamic *found = nullptr;
    for (const auto &entry : style) {
      const dynamic *inner = lastStyleValue(entry, key);
      if (inner != nullptr) found = inner;
    }
    return found;
  }
  if (!style.isObject()) return nullptr;
  return style.get_ptr(key);
}

// ── ARIA ─────────────────────────────────────────────────────────────────────────────────────────

// Copied line for line from `core/engine/src/accessibility-props.ts`, which was itself copied from
// RN's View.js. A role that falls through passes UNMAPPED, so a missing entry is silent: diff this
// against the reference rather than reading it for plausibility.
const std::unordered_map<std::string, std::string> kRoleToAccessibilityRole = {
    {"alert", "alert"},
    {"button", "button"},
    {"checkbox", "checkbox"},
    {"combobox", "combobox"},
    {"grid", "grid"},
    {"heading", "header"},
    {"img", "image"},
    {"link", "link"},
    {"list", "list"},
    {"listitem", "list"},
    {"menu", "menu"},
    {"menubar", "menubar"},
    {"menuitem", "menuitem"},
    {"none", "none"},
    {"presentation", "none"},
    {"progressbar", "progressbar"},
    {"radio", "radio"},
    {"radiogroup", "radiogroup"},
    {"scrollbar", "scrollbar"},
    {"searchbox", "search"},
    {"slider", "adjustable"},
    {"spinbutton", "spinbutton"},
    {"summary", "summary"},
    {"switch", "switch"},
    {"tab", "tab"},
    {"tablist", "tablist"},
    {"timer", "timer"},
    {"toolbar", "toolbar"},
};

const std::vector<std::string> kAriaKeys = {
    "role",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "aria-hidden",
    "aria-busy",
    "aria-checked",
    "aria-disabled",
    "aria-expanded",
    "aria-selected",
    "aria-modal",
    "aria-valuemax",
    "aria-valuemin",
    "aria-valuenow",
    "aria-valuetext",
};

bool isAriaAliasKey(const std::string &key) {
  return key == "role" || key.rfind("aria-", 0) == 0;
}

/**
 * The gate `ISymbioteNode.hasAriaAlias` is on the other side of the wire.
 *
 * It is a MEMO, not a fact: it is sticky, and `foldAriaProps` re-checks presence itself, so the
 * reference's output is the fold applied whenever the bag holds an alias and the flag only decides
 * whether the probe runs. That makes it recomputable here, exactly, and nothing has to cross.
 *
 * One pass over the keys the bag HAS rather than the reference's 15 probes for keys it usually has
 * not — the bag is in hand on this side, which is the whole difference. `undefined` cannot be a
 * value here (`recordSetProp` erases the key instead), so key presence is the same question the
 * reference's `props[key] !== undefined` asks.
 */
bool hasAriaAlias(const dynamic &props) {
  for (const auto &pair : props.items()) {
    if (pair.first.isString() && isAriaAliasKey(pair.first.getString())) return true;
  }
  return false;
}

const dynamic *fieldOf(const dynamic *source, const char *field) {
  if (source == nullptr || !source->isObject()) return nullptr;
  return source->get_ptr(field);
}

/** `a ?? b` — a null holds no value, and an absent key is the same as a null one here. */
dynamic coalesce(const dynamic *first, const dynamic *second) {
  if (first != nullptr && !first->isNull()) return *first;
  if (second != nullptr && !second->isNull()) return *second;
  return dynamic(nullptr);
}

// `aria-labelledby` is a comma-separated list. The reference splits on /\s*,\s*/ and keeps empty
// pieces, so a trailing comma yields a trailing empty string on both sides.
dynamic splitLabelledBy(const std::string &text) {
  dynamic out = dynamic::array();
  size_t at = 0;
  while (true) {
    const size_t comma = text.find(',', at);
    const size_t end = comma == std::string::npos ? text.size() : comma;
    size_t begin = at;
    size_t stop = end;
    while (begin < stop && std::isspace(static_cast<unsigned char>(text[begin]))) begin += 1;
    while (stop > begin && std::isspace(static_cast<unsigned char>(text[stop - 1]))) stop -= 1;
    out.push_back(text.substr(begin, stop - begin));
    if (comma == std::string::npos) return out;
    at = comma + 1;
  }
}

/**
 * Fold the web-alias `aria-*` / `role` props into RN's canonical `accessibility*` props.
 *
 * A MOVE of `accessibility-props.ts`, not a rewrite, and its TWO CONTRADICTORY PRECEDENCE RULES
 * survive intact: for the scalars an explicit `accessibility*` WINS and the alias only fills a hole,
 * while INSIDE the `accessibilityState` / `accessibilityValue` composites the ALIAS wins per field.
 * Both mirror RN's View.js. Collapsing them into one rule changes real accessibility with nothing
 * visible on screen — read `core/components/src/accessibility-props.test.ts` before touching either
 * branch, including the UPSTREAM-BUG(react-native) note there about `aria-checked` reaching native
 * as a STRING, which is ported deliberately.
 *
 * Aliases are ERASED rather than blanked. The reference writes `undefined` over them so its own
 * top-level walk skips them; the payload is the same either way, and this side has no `undefined`.
 */
dynamic foldAriaProps(const dynamic &props) {
  dynamic bag = props;

  const dynamic *role = props.get_ptr("role");
  const dynamic *ariaLabel = props.get_ptr("aria-label");
  const dynamic *ariaLabelledBy = props.get_ptr("aria-labelledby");
  const dynamic *ariaLive = props.get_ptr("aria-live");
  const dynamic *ariaHidden = props.get_ptr("aria-hidden");
  const dynamic *ariaBusy = props.get_ptr("aria-busy");
  const dynamic *ariaChecked = props.get_ptr("aria-checked");
  const dynamic *ariaDisabled = props.get_ptr("aria-disabled");
  const dynamic *ariaExpanded = props.get_ptr("aria-expanded");
  const dynamic *ariaSelected = props.get_ptr("aria-selected");
  const dynamic *ariaModal = props.get_ptr("aria-modal");
  const dynamic *ariaValueMax = props.get_ptr("aria-valuemax");
  const dynamic *ariaValueMin = props.get_ptr("aria-valuemin");
  const dynamic *ariaValueNow = props.get_ptr("aria-valuenow");
  const dynamic *ariaValueText = props.get_ptr("aria-valuetext");

  for (const auto &key : kAriaKeys) bag.erase(key);

  // RULE ONE, for every scalar: the explicit prop WINS, the alias only fills a hole.
  if (ariaLabelledBy != nullptr && ariaLabelledBy->isString() &&
      bag.get_ptr("accessibilityLabelledBy") == nullptr) {
    bag["accessibilityLabelledBy"] = splitLabelledBy(ariaLabelledBy->getString());
  }

  if (ariaLabel != nullptr && bag.get_ptr("accessibilityLabel") == nullptr) {
    bag["accessibilityLabel"] = *ariaLabel;
  }

  if (ariaLive != nullptr && bag.get_ptr("accessibilityLiveRegion") == nullptr) {
    const bool isOff = ariaLive->isString() && ariaLive->getString() == "off";
    bag["accessibilityLiveRegion"] = isOff ? dynamic("none") : *ariaLive;
  }

  // One input, TWO outputs, and the second is conditional on the VALUE rather than on presence.
  if (ariaHidden != nullptr) {
    if (bag.get_ptr("accessibilityElementsHidden") == nullptr) {
      bag["accessibilityElementsHidden"] = *ariaHidden;
    }
    if (ariaHidden->isBool() && ariaHidden->getBool() &&
        bag.get_ptr("importantForAccessibility") == nullptr) {
      bag["importantForAccessibility"] = "no-hide-descendants";
    }
  }

  if (ariaModal != nullptr && bag.get_ptr("accessibilityViewIsModal") == nullptr) {
    bag["accessibilityViewIsModal"] = *ariaModal;
  }

  if (role != nullptr && role->isString() && bag.get_ptr("accessibilityRole") == nullptr) {
    const auto mapped = kRoleToAccessibilityRole.find(role->getString());
    bag["accessibilityRole"] =
        mapped == kRoleToAccessibilityRole.end() ? role->getString() : mapped->second;
  }

  // RULE TWO, INSIDE the composites: the polarity INVERTS and the ALIAS wins per field. Read from
  // the ORIGINAL props — the erase loop above has already taken the aliases out of `bag`.
  //
  // The composite is REPLACED by a fresh object listing exactly the known fields, so an unknown
  // field riding on the incoming object is dropped. Faithful to RN, and pinned by a test.
  const dynamic *existingState = props.get_ptr("accessibilityState");
  if (existingState != nullptr || ariaBusy != nullptr || ariaChecked != nullptr ||
      ariaDisabled != nullptr || ariaExpanded != nullptr || ariaSelected != nullptr) {
    dynamic state = dynamic::object();
    state["busy"] = coalesce(ariaBusy, fieldOf(existingState, "busy"));
    state["checked"] = coalesce(ariaChecked, fieldOf(existingState, "checked"));
    state["disabled"] = coalesce(ariaDisabled, fieldOf(existingState, "disabled"));
    state["expanded"] = coalesce(ariaExpanded, fieldOf(existingState, "expanded"));
    state["selected"] = coalesce(ariaSelected, fieldOf(existingState, "selected"));
    bag["accessibilityState"] = std::move(state);
  }

  const dynamic *existingValue = props.get_ptr("accessibilityValue");
  if (existingValue != nullptr || ariaValueMax != nullptr || ariaValueMin != nullptr ||
      ariaValueNow != nullptr || ariaValueText != nullptr) {
    dynamic value = dynamic::object();
    value["max"] = coalesce(ariaValueMax, fieldOf(existingValue, "max"));
    value["min"] = coalesce(ariaValueMin, fieldOf(existingValue, "min"));
    value["now"] = coalesce(ariaValueNow, fieldOf(existingValue, "now"));
    value["text"] = coalesce(ariaValueText, fieldOf(existingValue, "text"));
    bag["accessibilityValue"] = std::move(value);
  }

  return bag;
}

// ── TEXT INPUT ───────────────────────────────────────────────────────────────────────────────────

/**
 * RN HAS NO `value` FABRIC PROP. A TextInput's controlled value rides as the private `text` prop,
 * and the wrapper is where `value ?? defaultValue` used to be folded — so a LOWERED element sent a
 * key no ViewConfig declares and the field rendered EMPTY, with nothing red anywhere.
 *
 * GATED ON THE COMPONENT, NOT ON THE PROP: `value` is also a prop of Switch and Slider, and a fold
 * keyed on the prop name would write a bogus `text` onto both.
 *
 * An explicit `text` is left alone — that is the component path, where the wrapper already folded,
 * and re-folding would let a stale `value` overwrite what it computed.
 *
 * The caller checks that there is anything to fold, so this never copies for nothing.
 */
dynamic foldTextInputValue(const dynamic &props) {
  const dynamic *value = props.get_ptr("value");
  const dynamic *defaultValue = props.get_ptr("defaultValue");

  dynamic folded = props;
  if (folded.get_ptr("text") == nullptr) {
    folded["text"] = value != nullptr ? *value : *defaultValue;
  }
  folded.erase("value");
  folded.erase("defaultValue");
  return folded;
}

// ── TEXT INPUT: THE WEB SPELLING, RESOLVED ───────────────────────────────────────────────────────
//
// What Blink does for `<input>`, done here for the same reason: an app writes the W3C name and the
// platform knows only its own. `inputMode` -> `keyboardType`, `enterKeyHint` -> `returnKeyType`,
// `readOnly` -> `editable`, one `autoComplete` token -> Android's `autoComplete` AND iOS's
// `textContentType`. It is a property of React Native, not of any app or framework, so every adapter
// gets it for the price of emitting the tag.
//
// MOVED FROM `core/components/src/behaviors/text-input.ts`, where it was a `payloadFold` — a JS
// closure the walk called per node per commit, converting the whole props bag out and back for it.
// Measured at the entire gap between React's walk and every other adapter's on one tree:
// `foldsFound=1000`, ~17 us apiece. There is NO TypeScript twin of what follows, deliberately; the
// contract is `core/engine/cpp/tests/js/text-input-payload.itest.ts`, which reads the payload this
// builder actually sent.
//
// Every table below is RN's own, cited to the line of `Libraries/Components/TextInput/TextInput.js`.

/** RN's inputMode -> keyboardType map, TextInput.js:815. `search` is split per platform, below. */
const std::unordered_map<std::string, std::string> &inputModeToKeyboardType() {
  static const auto *table = new std::unordered_map<std::string, std::string>{
      {"decimal", "decimal-pad"}, {"email", "email-address"}, {"none", "default"},
      {"numeric", "number-pad"},  {"tel", "phone-pad"},       {"text", "default"},
      {"url", "url"},
  };
  return *table;
}

/** RN's enterKeyHint -> returnKeyType map, TextInput.js:805. Note `enter` -> 'default'. */
const std::unordered_map<std::string, std::string> &enterKeyHintToReturnKeyType() {
  static const auto *table = new std::unordered_map<std::string, std::string>{
      {"done", "done"}, {"enter", "default"},     {"go", "go"},     {"next", "next"},
      {"previous", "previous"}, {"search", "search"}, {"send", "send"},
  };
  return *table;
}

/** RN's W3C autocomplete -> Android `autoComplete` map, TextInput.js:828. */
const std::unordered_map<std::string, std::string> &autoCompleteWebToAndroid() {
  static const auto *table = new std::unordered_map<std::string, std::string>{
      {"additional-name", "name-middle"},
      {"address-line1", "postal-address-region"},
      {"address-line2", "postal-address-locality"},
      {"bday", "birthdate-full"},
      {"bday-day", "birthdate-day"},
      {"bday-month", "birthdate-month"},
      {"bday-year", "birthdate-year"},
      {"cc-csc", "cc-csc"},
      {"cc-exp", "cc-exp"},
      {"cc-exp-month", "cc-exp-month"},
      {"cc-exp-year", "cc-exp-year"},
      {"cc-number", "cc-number"},
      {"country", "postal-address-country"},
      {"current-password", "password"},
      {"email", "email"},
      {"family-name", "name-family"},
      {"given-name", "name-given"},
      {"honorific-prefix", "name-prefix"},
      {"honorific-suffix", "name-suffix"},
      {"name", "name"},
      {"new-password", "password-new"},
      {"off", "off"},
      {"one-time-code", "sms-otp"},
      {"postal-code", "postal-code"},
      {"sex", "gender"},
      {"street-address", "street-address"},
      {"tel", "tel"},
      {"tel-country-code", "tel-country-code"},
      {"tel-national", "tel-national"},
      {"username", "username"},
  };
  return *table;
}

/** RN's W3C autocomplete -> iOS `textContentType` map, TextInput.js:862. */
const std::unordered_map<std::string, std::string> &autoCompleteWebToTextContentType() {
  static const auto *table = new std::unordered_map<std::string, std::string>{
      {"additional-name", "middleName"},
      {"address-line1", "streetAddressLine1"},
      {"address-line2", "streetAddressLine2"},
      {"bday", "birthdate"},
      {"bday-day", "birthdateDay"},
      {"bday-month", "birthdateMonth"},
      {"bday-year", "birthdateYear"},
      {"cc-additional-name", "creditCardMiddleName"},
      {"cc-csc", "creditCardSecurityCode"},
      {"cc-exp", "creditCardExpiration"},
      {"cc-exp-month", "creditCardExpirationMonth"},
      {"cc-exp-year", "creditCardExpirationYear"},
      {"cc-family-name", "creditCardFamilyName"},
      {"cc-given-name", "creditCardGivenName"},
      {"cc-name", "creditCardName"},
      {"cc-number", "creditCardNumber"},
      {"cc-type", "creditCardType"},
      {"country", "countryName"},
      {"current-password", "password"},
      {"email", "emailAddress"},
      {"family-name", "familyName"},
      {"given-name", "givenName"},
      {"honorific-prefix", "namePrefix"},
      {"honorific-suffix", "nameSuffix"},
      {"name", "name"},
      {"new-password", "newPassword"},
      {"nickname", "nickname"},
      {"off", "none"},
      {"one-time-code", "oneTimeCode"},
      {"organization", "organizationName"},
      {"organization-title", "jobTitle"},
      {"postal-code", "postalCode"},
      {"street-address", "fullStreetAddress"},
      {"tel", "telephoneNumber"},
      {"url", "URL"},
      {"username", "username"},
  };
  return *table;
}

/** The string a key holds, or null when it is absent or is not a string. */
const std::string *stringAt(const dynamic &props, const char *key) {
  const dynamic *found = props.get_ptr(key);
  if (found == nullptr || !found->isString()) return nullptr;
  return &found->getString();
}

/**
 * The bool a key holds, or nothing when it is absent or is not a bool.
 *
 * A VALUE, and it has to be. This returned `const bool *` into a single `static thread_local` slot
 * until 2026-09-18, which meant any two results held at once silently aliased — the second read
 * rewrote the first. Nothing had two live at a time, so nothing was wrong; the Android switch rule
 * is the first caller that needs `disabled` and `accessibilityState.disabled` side by side, and it
 * would have resolved every switch through whichever was read last.
 */
std::optional<bool> boolAt(const dynamic &props, const char *key) {
  const dynamic *found = props.get_ptr(key);
  if (found == nullptr || !found->isBool()) return std::nullopt;
  return found->getBool();
}

/** A safe lookup: the mapped token, or null when the map has no entry. The caller owns the fallback. */
const std::string *mappedToken(
    const std::unordered_map<std::string, std::string> &table,
    const std::string &token) {
  const auto found = table.find(token);
  return found == table.end() ? nullptr : &found->second;
}

/**
 * RN's submitBehavior reconciliation, TextInput.js:559.
 *
 * It returns a value for an EMPTY bag, which is what makes it a RULE rather than a mapping: a
 * singleline input with nothing authored still submits on return. An explicit `newline` on a
 * singleline tag is coerced — there is no newline to insert.
 */
std::string foldSubmitBehavior(
    const std::string *submitBehavior,
    std::optional<bool> blurOnSubmit,
    bool isMultiline) {
  if (submitBehavior != nullptr) {
    if (!isMultiline && *submitBehavior == "newline") return "blurAndSubmit";
    return *submitBehavior;
  }
  if (isMultiline) {
    return blurOnSubmit.value_or(false) ? "blurAndSubmit" : "newline";
  }
  return blurOnSubmit.has_value() && !*blurOnSubmit ? "submit" : "blurAndSubmit";
}

/**
 * The whole rule, applied to the bag on its way to the payload.
 *
 * WRITES ONLY WHAT IT RESOLVES and erases only the aliases, so an authored native name always
 * survives: every branch below reads the native key first and falls back to the web one, which is
 * RN's own precedence (TextInput.js:930-946).
 */
dynamic foldTextInputAliases(const dynamic &props, bool isMultiline) {
  dynamic out = props;

  const std::string *inputMode = stringAt(props, "inputMode");
  if (inputMode != nullptr && out.get_ptr("keyboardType") == nullptr) {
    // `search` is the ONE token RN resolves per platform (TextInput.js:815-825): iOS has a dedicated
    // search keyboard whose return key is a magnifier, every other host falls back to the default.
    if (*inputMode == "search") {
#ifdef ANDROID
      out["keyboardType"] = "default";
#else
      out["keyboardType"] = "web-search";
#endif
    } else {
      const std::string *mapped = mappedToken(inputModeToKeyboardType(), *inputMode);
      if (mapped != nullptr) out["keyboardType"] = *mapped;
    }
  }

  const std::string *enterKeyHint = stringAt(props, "enterKeyHint");
  if (enterKeyHint != nullptr && out.get_ptr("returnKeyType") == nullptr) {
    const std::string *mapped = mappedToken(enterKeyHintToReturnKeyType(), *enterKeyHint);
    if (mapped != nullptr) out["returnKeyType"] = *mapped;
  }

  // The web spelling is the NEGATION of the native one. Getting it backwards makes every read-only
  // field editable, silently.
  const std::optional<bool> readOnly = boolAt(props, "readOnly");
  if (readOnly.has_value() && out.get_ptr("editable") == nullptr) {
    out["editable"] = !*readOnly;
  }

  out["submitBehavior"] = foldSubmitBehavior(
      stringAt(props, "submitBehavior"), boolAt(props, "blurOnSubmit"), isMultiline);

  // RN's three selection colours coalesce onto one authored value, so writing `selectionColor` alone
  // gets a matching caret and handle.
  const dynamic *selectionColor = props.get_ptr("selectionColor");
  if (selectionColor != nullptr && !selectionColor->isNull()) {
    if (out.get_ptr("cursorColor") == nullptr) out["cursorColor"] = *selectionColor;
    if (out.get_ptr("selectionHandleColor") == nullptr) {
      out["selectionHandleColor"] = *selectionColor;
    }
  }

  // RN resolves BOTH native props from the one W3C token (TextInput.js:938). Android reads
  // `autoComplete` and iOS reads `textContentType`; each is inert on the other platform, so emitting
  // both is safe and is what keeps this fold platform-agnostic. A token with no Android entry falls
  // back to ITSELF (RN's `?? autoComplete`); one with no iOS entry leaves `textContentType` unset.
  const std::string *autoComplete = stringAt(props, "autoComplete");
  if (autoComplete != nullptr) {
    const std::string *android = mappedToken(autoCompleteWebToAndroid(), *autoComplete);
    out["autoComplete"] = android != nullptr ? *android : *autoComplete;
    if (out.get_ptr("textContentType") == nullptr) {
      const std::string *ios = mappedToken(autoCompleteWebToTextContentType(), *autoComplete);
      if (ios != nullptr) out["textContentType"] = *ios;
    }
  }

  // `inputMode: 'none'` is how the web spells "focusable but no keyboard".
  if (inputMode != nullptr && out.get_ptr("showSoftInputOnFocus") == nullptr) {
    out["showSoftInputOnFocus"] = *inputMode != "none";
  }

  // ANDROID ONLY, and that is F-76 rather than tidiness: iOS's `RCTSinglelineTextInputView`
  // ViewConfig does not declare `underlineColorAndroid` at all, so RN's own
  // `ReactNativeAttributePayload.create` filters it out and it never leaves JS there. We have no such
  // filter, so defaulting it unconditionally sent a key every iOS view silently dropped — one wire
  // slot, one interned string, one hashed RawProps entry, per TextInput, for nothing.
#ifdef ANDROID
  if (out.get_ptr("underlineColorAndroid") == nullptr) {
    out["underlineColorAndroid"] = "transparent";
  }
#endif

  // The aliases themselves must NOT ride along: none is a native prop, and leaving one in the payload
  // is how a reader concludes the rule ran when it did not.
  out.erase("inputMode");
  out.erase("enterKeyHint");
  out.erase("readOnly");
  out.erase("blurOnSubmit");
  return out;
}

/**
 * Which tags the pressable rule below belongs to — the three that a pressable IS, in RN's own terms.
 *
 * `touchable-opacity` is a pressable plus a fade (`TouchableOpacity.js` wraps Pressability), and
 * `button` is a touchable plus a label on iOS and a TouchableNativeFeedback on Android
 * (`Button.js:283`) — so on either platform a `<button>`'s platform half runs through this. Both
 * composed the same function in JS before it moved, which is what this list is the record of.
 *
 * A composed tag has to be NAMED here because the wire carries what the node IS, not what its
 * behavior was built out of — the browser's arrangement, and the one worth keeping: a reader asks
 * "what does a `<button>` send" and this answers it without tracing a composition.
 *
 * `touchable-highlight` is deliberately ABSENT and always was: its behavior replaces the fold rather
 * than composing it, so it has never carried the machine-key strip. That is a gap in it, not here.
 */
bool usesPressableRule(const std::string &tagName) {
  return tagName == "pressable" || tagName == "touchable-opacity" ||
      tagName == "touchable-highlight" || tagName == "button";
}

/**
 * The three tags built on the TOUCHABLE feedback machine rather than on bare Pressable. They take a
 * second strip, below — `pressable` does not, because none of these names is one of its props.
 *
 * `button` is here because it composes TouchableOpacity (`Button.js:283`), so it inherits the same
 * consumed set even though an app rarely spells those props on it.
 */
bool usesTouchableFeedbackRule(const std::string &tagName) {
  return tagName == "touchable-opacity" || tagName == "touchable-highlight" ||
      tagName == "button";
}

/**
 * The tags whose `focusable` takes RN's THREE-leg touchable form rather than Pressable's plain one:
 * `focusable !== false && onPress !== undefined && !disabled`
 * (`TouchableOpacity.js:336-339`, `TouchableHighlight.js` identically).
 *
 * `button` is deliberately NOT here even though it composes TouchableOpacity, and the reason is
 * precedence rather than shape. Button resolves `disabled` three ways —
 * `props.disabled ?? aria-disabled ?? accessibilityState.disabled` (`Button.js:331,337`) — through
 * the same projection its derived children read, and it keeps a fold for its Android view style and
 * ripple regardless. So moving only its `focusable` here would duplicate that precedence in two
 * places and buy no crossing back. It stays on the plain form, whose `!== false` leaves the answer
 * its own fold already computed untouched — which is how the two compose today.
 */
bool usesTouchableFocusableRule(const std::string &tagName) {
  return tagName == "touchable-opacity" || tagName == "touchable-highlight";
}

/**
 * What the feedback machine CONSUMES. RN forwards none of them to the View it renders — read the
 * prop lists at `TouchableOpacity.js:302-345` and `TouchableHighlight.js:336-378`: every name they
 * pass is spelled out, and not one of these is among them.
 *
 * Two are FUNCTIONS. A callback reaching a native prop bag is not a cosmetic leak; it is a value no
 * ViewConfig declares, crossing for a view that will never call it.
 */
const std::array<const char *, 6> kTouchableFeedbackKeys = {
    "activeOpacity",
    "underlayColor",
    "onShowUnderlay",
    "onHideUnderlay",
    "delayPressIn",
    "delayPressOut",
};

/**
 * RN's own two feedback defaults, `TouchableHighlight.js:258-268`. Constants of the PLATFORM — every
 * TouchableHighlight in every app gets them unless it says otherwise — which is what makes them the
 * engine's and not any component's.
 */
constexpr double kHighlightChildOpacity = 0.85;
constexpr const char *kHighlightUnderlayColor = "black";

/**
 * TouchableHighlight's UNDERLAY, and the last props-shaped rule in the migration.
 *
 * ONE NODE, which is the simplification every adapter already shipped rather than one this rule
 * invents. RN renders a container View carrying the underlay and CLONES an extra opacity style onto
 * its single child (`TouchableHighlight.js:189, 258-268`); every wrapper here folds BOTH onto the one
 * node instead, because splitting them needs a child to target and a framework component holding an
 * opaque children slot cannot reach one safely. The port keeps that, it does not reopen it.
 *
 * TWO INPUTS THAT ARE NOT PROPS, both already crossing:
 *   `underlayShown`      the feedback bit — `kOpSetUnderlayShown`, flipped by the JS hold timer
 *   `hasAnyPressListener` RN's `_hasPressHandler` (`:296-302`), any of four owned names
 *
 * WHY `authored` AND NOT THE BAG. `foldPressableProps` has already run and stripped `underlayColor`
 * and `activeOpacity` — they are in `kTouchableFeedbackKeys`, because RN forwards neither to the View
 * it renders. Read from the bag they would both be absent here and every underlay would silently be
 * black at 0.85 whatever the app asked for. Trap A, in the form that makes it a SILENT wrong answer
 * rather than a missing key.
 *
 * COMPOSES, never replaces: the two styles go OVER the author's, matching the order RN appends them
 * in. Reversed, a highlight with a background colour of its own would never visibly respond.
 */
dynamic foldTouchableHighlightUnderlay(
    const dynamic &props,
    const dynamic &authored,
    const ISelf &self) {
  // RN's snapshot affordance (`TouchableHighlight.js:61,189,284-286`): it paints the underlay with no
  // gesture, and `_hideUnderlay` returns early on it, so the pin LATCHES. Both halves are this one
  // expression — a rule that ignores the live bit needs nothing from the machine to stay latched.
  //
  // IT BYPASSES THE PRESS-HANDLER GATE, and that asymmetry is upstream's rather than an oversight.
  // `_showUnderlay` checks `_hasPressHandler` (`:271`), but the INITIAL state is
  // `testOnly_pressed === true ? this._createExtraStyles() : null` with no such check — so a
  // decorative control still snapshots pressed, which is what a snapshot of one needs. Reproducing
  // the gate here would look more consistent and be wrong.
  //
  // READ OFF `authored`, which matters here rather than being a habit: this runs after
  // `foldPressableProps`, which strips the name (`kPressableMachineKeys`) so it never reaches
  // Fabric. Read from the bag it would already be gone. Trap A, in the form where the rule that
  // erases a key and the rule that uses it are two different rules.
  const bool forced = boolAt(authored, "testOnly_pressed").value_or(false);
  if (!forced && (!self.underlayShown || !self.hasAnyPressListener))
    return props;

  dynamic underlay = dynamic::object();
  const dynamic *color = authored.get_ptr("underlayColor");
  underlay["backgroundColor"] =
      color != nullptr && !color->isNull() ? *color : dynamic(kHighlightUnderlayColor);

  dynamic child = dynamic::object();
  const dynamic *opacity = authored.get_ptr("activeOpacity");
  child["opacity"] = opacity != nullptr && opacity->isNumber()
      ? *opacity
      : dynamic(kHighlightChildOpacity);

  dynamic composed = dynamic::array();
  const dynamic *style = props.get_ptr("style");
  if (style != nullptr) composed.push_back(*style);
  composed.push_back(std::move(underlay));
  composed.push_back(std::move(child));

  dynamic out = props;
  out["style"] = std::move(composed);
  return out;
}

/**
 * The per-axis base style every ScrollView box carries, and the ONE place it is spelled.
 *
 * IT HAD A SECOND COPY IN JS UNTIL 2026-09-18, held by `scroll-view-base-parity.itest.ts` because
 * the Android wrap's split needed the value on the JS side. The split is here now, so the copy is
 * gone and the parity test with it — a mirror that becomes unnecessary is deleted rather than
 * guarded, which is the outcome that test existed to make possible.
 */
dynamic scrollViewBaseStyle(bool isHorizontal) {
  dynamic base = dynamic::object();
  base["flexGrow"] = 1;
  base["flexShrink"] = 1;
  base["flexDirection"] = isHorizontal ? "row" : "column";
  base["overflow"] = "scroll";
  return base;
}

/** `[base, authored]` — base UNDER, so an explicit user value wins. `addStyle` reads in order. */
dynamic composeUnder(dynamic base, const dynamic *authored) {
  dynamic composed = dynamic::array(std::move(base));
  if (authored != nullptr) composed.push_back(*authored);
  return composed;
}

/**
 * RN's `splitLayoutProps` key partition (`StyleSheet/splitLayoutProps.js`): the keys that belong on
 * the OUTER box when a layout-affecting wrapper sits between the laid-out frame and the visual
 * content. Everything NOT here (background*, padding*, border*, opacity, overflow, …) is VISUAL and
 * stays on the inner view.
 *
 * Replicated from upstream's switch cases. A key missing from this set does not fail loudly — it
 * quietly stays on the inner box, where a margin has no effect — so diff it against upstream rather
 * than reading it for plausibility, the same instruction `kRoleToAccessibilityRole` carries.
 */
const std::unordered_set<std::string> kScrollLayoutKeys = {
    "margin",     "marginHorizontal", "marginVertical", "marginBottom",
    "marginTop",  "marginLeft",       "marginRight",    "flex",
    "flexGrow",   "flexShrink",       "flexBasis",      "alignSelf",
    "height",     "minHeight",        "maxHeight",      "width",
    "minWidth",   "maxWidth",         "position",       "left",
    "right",      "bottom",           "top",            "transform",
    "transformOrigin", "rowGap",      "columnGap",      "gap",
};

/** Flatten a (possibly nested) style slot to one object, RAW — no `processValue`. */
void flattenStyleInto(dynamic &out, const dynamic &style) {
  if (style.isArray()) {
    for (const auto &entry : style) flattenStyleInto(out, entry);
    return;
  }
  if (!style.isObject()) return;
  for (const auto &pair : style.items()) {
    if (!pair.first.isString()) continue;
    out[pair.first.getString()] = pair.second;
  }
}

struct IScrollStyleSplit {
  dynamic outer;
  dynamic inner;
};

/**
 * The whole Android wrap style decision: the layout/visual split AND the axis base composed onto
 * BOTH boxes (`ScrollView.js:1856`, `StyleSheet.compose(baseStyle, outer)` beside
 * `compose(baseStyle, inner)`).
 *
 * The second half is the one every adapter had dropped from the wrapper before this became one
 * function: an `AndroidSwipeRefreshLayout` with no explicit user layout style lost `flexGrow: 1` and
 * collapsed to its content height inside a flex parent, where RN's grows.
 *
 * ONE FUNCTION SERVING TWO NODES is the reason the pair can be a rule at all — the scroller asks for
 * `.inner` off its own bag and the wrapper asks for `.outer` off its child's, and neither can be
 * right while the other is wrong.
 */
IScrollStyleSplit splitScrollViewStyle(bool isHorizontal, const dynamic *authored) {
  dynamic flat = dynamic::object();
  if (authored != nullptr) flattenStyleInto(flat, *authored);

  dynamic outer = dynamic::object();
  dynamic inner = dynamic::object();
  for (const auto &pair : flat.items()) {
    const std::string &key = pair.first.getString();
    if (kScrollLayoutKeys.count(key) != 0) outer[key] = pair.second;
    else inner[key] = pair.second;
  }
  return IScrollStyleSplit{
      composeUnder(scrollViewBaseStyle(isHorizontal), &outer),
      composeUnder(scrollViewBaseStyle(isHorizontal), &inner)};
}

/** Which tags are a scroll view, for the wrapper rule that has to ask about its child. */
bool isScrollViewTag(const char *tagName) {
  if (tagName == nullptr) return false;
  return std::strcmp(tagName, "scroll-view") == 0 ||
      std::strcmp(tagName, "horizontal-scroll-view") == 0;
}

/**
 * The Android RefreshControl WRAPPER — the first rule in the engine that reads DOWNWARD.
 *
 * An Android ScrollView holds exactly one child, so a sibling refresh control is an `addViewAt`
 * crash rather than a layout mistake. RN inverts the tree and splits the scroller's style across the
 * two boxes; this node is the outer one and its frame is the LAYOUT half of a style the app wrote on
 * the node BELOW it. That is the read `IOwner` cannot do and `IFirstChild` exists for.
 *
 * REPLACING the app's own `style` is parity rather than a liberty: RN reaches the same place through
 * `cloneElement(refreshControl, {style: outer}, …)`, which likewise overrides whatever the refresh
 * control was given.
 *
 * A REFRESH CONTROL THAT WRAPS NOTHING IS UNTOUCHED, and the guard is the child's TAG rather than
 * its presence. On iOS the control is claimed BESIDE the content and an app may mount one alone;
 * either way inventing a base style for an axis nobody chose would paint a `flexGrow` onto a
 * standalone control.
 */
dynamic foldRefreshWrapperProps(const dynamic &props, const IFirstChild &child) {
  if (!isScrollViewTag(child.tagName) || child.props == nullptr) return props;

  dynamic out = props;
  out["style"] = splitScrollViewStyle(
                     std::strcmp(child.tagName, "horizontal-scroll-view") == 0,
                     child.props->get_ptr("style"))
                     .outer;
  return out;
}

/**
 * ScrollView's owner, both axes (`ScrollView.js:1753-1761` and the wrapper body).
 *
 * THE TAG IS THE ONLY AXIS INPUT, which is what keeps the three halves of the axis from disagreeing:
 * the scroller's own `horizontal`, the base style's `flexDirection`, and the content node's row
 * style all derive from ONE thing. RN derives them from one prop so a mismatch is unrepresentable
 * there; here the tag plays that part, and on iOS both tags really are `RCTScrollView`, so a stray
 * `horizontal` would otherwise produce a vertical scroller over a content node with no row style —
 * a shape RN cannot make.
 *
 * So an app writing `horizontal` on the vertical tag is IGNORED, and ignoring it in silence is the
 * failure the warning below exists to prevent. This is the first rule in the engine to WARN rather
 * than crash, and it is why `SymbioteDebug.h` had to exist before this port could happen at all.
 *
 * THE BOUNCE PAIR IS ASYMMETRIC and that is upstream's shape rather than an oversight: RN falls back
 * to `this.props.horizontal`, which is unset on a vertical view, so `alwaysBounceHorizontal` simply
 * never resolves there and never reaches the payload. Both names are declared in every adapter's
 * prop type and computed in none — vertical never bounced by default.
 *
 * THE TWO STRIPS are consumed by the behavior and declared by no ViewConfig — neither name appears
 * anywhere under `ReactCommon/react/renderer/components/scrollview`. `stickyHeaderIndices` decides
 * which children become a `sticky-header`; `invertStickyHeaders` feeds the pin. A key Fabric does
 * not know throws nothing, logs nothing and paints nothing, so the strip is only ever visible in a
 * payload test.
 */
dynamic foldScrollViewProps(const dynamic &props, bool isHorizontal, bool isWrapped) {
  dynamic out = props;

  const dynamic *authored = props.get_ptr("style");
  // WRAPPED IS A DIFFERENT COMPOSITION, not an extra one: on Android a RefreshControl becomes this
  // node's PARENT and takes the LAYOUT half of the app's style with it, so composing `[base,
  // authored]` here would put every margin on both boxes. See `foldRefreshWrapperProps` for the
  // other half and `IFirstChild` for why the pair can be one decision at all.
  //
  // TOPOLOGY DECIDES, NOT `#ifdef ANDROID`, and that is the same win `Switch`/`AndroidSwitch` gives:
  // iOS claims the refresh control BESIDE the content, so a scroll view is never one's child there
  // and this branch cannot fire whatever the host was compiled for.
  out["style"] = isWrapped
      ? splitScrollViewStyle(isHorizontal, authored).inner
      : composeUnder(scrollViewBaseStyle(isHorizontal), authored);

  out["nestedScrollEnabled"] = boolAt(props, "nestedScrollEnabled").value_or(true);

  const std::optional<bool> authoredAxis = boolAt(props, "horizontal");
  if (authoredAxis.has_value() && *authoredAxis != isHorizontal) {
    SYMBIOTE_DLOG(
        std::string("ScrollView: horizontal=") +
        (*authoredAxis ? "true" : "false") +
        " ignored — the axis comes from the tag; write <" +
        (isHorizontal ? "scroll-view" : "horizontal-scroll-view") + "> instead");
  }
  out.erase("horizontal");
  if (isHorizontal) out["horizontal"] = true;

  if (props.get_ptr("alwaysBounceHorizontal") == nullptr && isHorizontal)
    out["alwaysBounceHorizontal"] = true;
  if (props.get_ptr("alwaysBounceVertical") == nullptr)
    out["alwaysBounceVertical"] = !isHorizontal;

  out.erase("stickyHeaderIndices");
  out.erase("invertStickyHeaders");

  // `normal` / `fast` are RN's two names for a platform constant (`ScrollView.js`'s
  // `decelerationRate` prop); a number passes through as itself. The values are iOS's and Android's
  // own, so this is the one branch here that a component name cannot decide — on iOS BOTH tags are
  // `RCTScrollView`, so the name says nothing about the platform.
  const dynamic *rate = props.get_ptr("decelerationRate");
  if (rate != nullptr && rate->isString()) {
    const std::string named = rate->asString();
#ifdef ANDROID
    if (named == "normal") out["decelerationRate"] = 0.985;
    else if (named == "fast") out["decelerationRate"] = 0.9;
#else
    if (named == "normal") out["decelerationRate"] = 0.998;
    else if (named == "fast") out["decelerationRate"] = 0.99;
#endif
  }
  return out;
}

/**
 * ScrollView's CONTENT node — the first rule here that reads the node ABOVE it.
 *
 * Two halves from two places. The row direction is a constant of this node's OWN tag
 * (`horizontal-scroll-content`), composed OVER the app's `contentContainerStyle` because that is the
 * order RN writes it in (`[contentContainerStyle, {flexDirection:'row'}]`) — the opposite precedence
 * from the owner's base style, and deliberately so.
 *
 * `collapsableChildren` is the half that needed `ownerProps`: both names that decide it stay on the
 * SCROLLER, and the node that must stop collapsing is this one. A Yoga-collapsed content view takes
 * the scroll metrics with it, and an anchored scroll needs its children to keep their identity.
 *
 * PRESENCE decides, not truthiness — `snapToAlignment: 'start'` and an empty
 * `maintainVisibleContentPosition` are both real requests. And the key is written ONLY when false,
 * matching every wrapper: RN sends `collapsableChildren={!preserveChildren}`, so an explicit `true`
 * is the native default and one more key on every scroll view that ever renders.
 */
dynamic foldScrollContentProps(
    const dynamic &props,
    bool isHorizontal,
    const dynamic *ownerProps) {
  // `ScrollView.js:1731-1733`, and the `snapToAlignment` leg is ANDROID-ONLY there. It was written
  // here without the gate until 2026-09-18, so an iOS scroller that merely snapped stopped Yoga
  // flattening its children — work RN never asks for. A compile-time branch rather than a component
  // name, for the reason `android_ripple` already is: a content node commits as
  // `RCTScrollContentView` on both platforms, so nothing on the wire tells them apart.
  const bool snaps =
#ifdef ANDROID
      ownerProps != nullptr && ownerProps->get_ptr("snapToAlignment") != nullptr;
#else
      false;
#endif
  const bool preserves = snaps ||
      (ownerProps != nullptr &&
       ownerProps->get_ptr("maintainVisibleContentPosition") != nullptr);

  // The identity return the reference fold had: a vertical content view under a scroller that
  // anchors nothing has nothing to add, which is the common case and the one worth not copying for.
  if (!isHorizontal && !preserves) return props;

  dynamic out = props;
  if (isHorizontal) {
    dynamic row = dynamic::object();
    row["flexDirection"] = "row";
    dynamic composed = dynamic::array();
    const dynamic *authored = props.get_ptr("style");
    if (authored != nullptr) composed.push_back(*authored);
    composed.push_back(std::move(row));
    out["style"] = std::move(composed);
  }
  if (preserves) out["collapsableChildren"] = false;
  return out;
}

/**
 * ImageBackground's wrapper (`ImageBackground.js:75`), and the whole rule is one key.
 *
 * iOS's Smart Invert inverts colours for accessibility, and a PHOTOGRAPH is exactly what must not be
 * inverted — a background image shown as its own negative is the case the prop exists for. RN sets
 * it on every ImageBackground it renders, so it is unconditional here too.
 *
 * Only the OWNER's rule. The inner image's style is DERIVED from this node's live style (RN proxies
 * the wrapper's width/height onto the image so it fills the box rather than collapsing to the
 * source's intrinsic size), which reads a second node and therefore stays a JS fold — composition,
 * not platform.
 */
dynamic foldImageBackgroundProps(const dynamic &props) {
  dynamic out = props;
  out["accessibilityIgnoresInvertColors"] = true;
  return out;
}

/**
 * The INNER image of an ImageBackground, over and above the ordinary image rule its tag also gets.
 *
 * RN'S OWN WORKAROUND, and its comment calls it one (`ImageBackground.js:86-96`): an RN Image
 * overwrites its own width/height from the SOURCE's intrinsic size, which fights the box the app
 * sized. So the wrapper's explicit dimensions are proxied back onto the image, under an absolute
 * fill, and the photograph covers the box instead of collapsing to the bitmap.
 *
 * Both inputs live on the node ABOVE — the app writes `style` on the `<image-background>` and
 * `IMAGE_BACKGROUND_HOST_PROPS` keeps it there — which is why this was the last fold in the file to
 * move and why `ownerProps` is what let it.
 *
 * READ THROUGH `lastStyleValue`, not off a plain object: a class name resolves into the owner's
 * style slot as an ARRAY (`pushClassStyle`), so an app that sizes its background with a stylesheet
 * rule — the common case — has no inline object to read.
 *
 * `imageStyle` arrives as this node's own `style` (the behavior's `slotProps` renames it) and is
 * composed LAST, so a caller beats both the fill and the proxy.
 */
dynamic foldImageBackgroundImageProps(
    const dynamic &props,
    const dynamic *ownerProps) {
  dynamic fill = dynamic::object();
  fill["position"] = "absolute";
  fill["left"] = 0;
  fill["right"] = 0;
  fill["top"] = 0;
  fill["bottom"] = 0;

  dynamic box = dynamic::object();
  const dynamic *ownerStyle =
      ownerProps == nullptr ? nullptr : ownerProps->get_ptr("style");
  if (ownerStyle != nullptr) {
    // Written only when the owner named one. A `width: undefined` would be the same as writing
    // nothing, but a 0 would collapse the image — so an unsized (flex) owner proxies NOTHING.
    const dynamic *width = lastStyleValue(*ownerStyle, "width");
    const dynamic *height = lastStyleValue(*ownerStyle, "height");
    if (width != nullptr) box["width"] = *width;
    if (height != nullptr) box["height"] = *height;
  }

  dynamic composed = dynamic::array(std::move(fill), std::move(box));
  const dynamic *own = props.get_ptr("style");
  if (own != nullptr) composed.push_back(*own);

  dynamic out = props;
  out["style"] = std::move(composed);
  return out;
}

// The two native spinners. Which one a tag resolves to is the PLATFORM split, and branching on the
// component name rather than on `#ifdef` keeps both halves reachable from one test build — the same
// choice `foldSwitchProps` makes for `Switch` / `AndroidSwitch`.
constexpr const char *kAndroidProgressBar = "AndroidProgressBar";

// The fixed pixel boxes RN gives its two named sizes (`styles.sizeSmall` / `styles.sizeLarge`).
constexpr double kSpinnerSmallPx = 20;
constexpr double kSpinnerLargePx = 36;

// RN's iOS default spinner colour (`ActivityIndicator.js:25`, GRAY). Android's default is the THEME,
// which is expressed by OMITTING the key — see below.
constexpr const char *kSpinnerIosDefaultColor = "#999999";

/**
 * The centering View RN wraps its spinner in (`ActivityIndicator.js:112-114`):
 * `StyleSheet.compose(styles.container, style)`.
 *
 * BASE FIRST, which is the whole content of that compose: the container centres the spinner inside
 * the space it was given, and an app's own style still wins over it. Reversed, an app could never
 * override the centering and the override would fail silently.
 *
 * The container cannot be folded into the spinner instead: `alignItems`/`justifyContent` centre the
 * spinner within its box, and on the spinner they would centre its children, of which it has none.
 */
dynamic foldActivityIndicatorProps(const dynamic &props) {
  dynamic out = props;
  dynamic container = dynamic::object();
  container["alignItems"] = "center";
  container["justifyContent"] = "center";

  dynamic composed = dynamic::array(std::move(container));
  const dynamic *authored = props.get_ptr("style");
  if (authored != nullptr) composed.push_back(*authored);
  out["style"] = std::move(composed);
  return out;
}

/** RN's `styles.header` z-index (`ScrollViewStickyHeader.js:318`). */
constexpr double kStickyHeaderZIndex = 10;

/**
 * The settled translate the sticky machine hands this rule. RN's twin is
 * `passthroughAnimatedPropExplicitValues`, a whole style object; ours carries the one number that
 * object ever holds, so it does not borrow the name. Stripped here — no ViewConfig declares it.
 */
constexpr const char *kStickyTranslateKey = "stickyTranslateY";

/**
 * The sticky header's wrapper (`ScrollViewStickyHeader.js:282-304`), and the LAST `payloadFold` this
 * codebase had.
 *
 * ITS THREE OUTPUTS SPLIT BY ORIGIN, which is the whole argument for the move: `zIndex` and
 * `collapsable` are constants of the wrapper — the platform's, in any app — while the translate is
 * live. The live one is live at SETTLE rate rather than frame rate (the smooth pin rides an
 * AnimatedProps leaf and never comes through here), and RN spells it as an ordinary PROP, so it
 * crosses as one instead of as a new opcode.
 *
 * COMPOSED OVER, not under, and that inverts the neighbouring rules. A pin is the entire point of
 * this element, so a header whose own style set a transform must not cancel it —
 * `foldActivityIndicatorProps` goes the other way because its base is a DEFAULT an app may override.
 * The distinction is whether the style is a default or a mechanism.
 *
 * `collapsable: false` is unconditional, as RN's literal JSX prop is. Yoga may flatten a view that
 * only groups children, and a flattened header has no view left to carry a transform — so the pin
 * would silently stop happening on exactly the headers that wrap nothing but their content.
 */
dynamic foldStickyHeaderProps(const dynamic &props) {
  dynamic pin = dynamic::object();
  pin["zIndex"] = kStickyHeaderZIndex;

  // Absent until the debounce first fires. Inventing a zero here would snap every header to the top
  // of its scroller on mount, so an unsettled machine contributes no transform at all and the app's
  // own survives.
  const dynamic *translate = props.get_ptr(kStickyTranslateKey);
  if (translate != nullptr && translate->isNumber()) {
    dynamic entry = dynamic::object();
    entry["translateY"] = translate->asDouble();
    pin["transform"] = dynamic::array(std::move(entry));
  }

  dynamic composed = dynamic::array();
  const dynamic *authored = props.get_ptr("style");
  if (authored != nullptr) composed.push_back(*authored);
  composed.push_back(std::move(pin));

  dynamic out = props;
  out.erase(kStickyTranslateKey);
  out["style"] = std::move(composed);
  out["collapsable"] = false;
  return out;
}

/**
 * The native spinner's own props — RN's component body (`ActivityIndicator.js:99-118`) applied to
 * the node the app never names.
 *
 * SIZE IS TWO ANSWERS FROM ONE PROP. A named size gives a native enum AND a fixed pixel box; a
 * NUMBER gives only the box, and the key has to LEAVE rather than merely go unwritten — the native
 * enum takes "small"/"large" and nothing else, so a numeric `size` reaching it is a value it cannot
 * read.
 *
 * THE COLOUR DEFAULT IS WHERE "absent" AND "null" STOP BEING THE SAME THING. Android's default is
 * the theme, expressed by sending no key at all; Fabric's colour parser REJECTS a null, so writing
 * one is a crash rather than a shade. iOS defaults to RN's GRAY.
 */
dynamic foldActivityIndicatorSpinnerProps(
    const dynamic &props,
    bool isAndroidProgressBar) {
  dynamic out = props;

  // RN's own default when the app writes no size (`:72`).
  double box = kSpinnerSmallPx;
  const char *sizeEnum = "small";
  const dynamic *size = props.get_ptr("size");
  if (size != nullptr && size->isString() && size->asString() == "large") {
    box = kSpinnerLargePx;
    sizeEnum = "large";
  } else if (size != nullptr && size->isNumber()) {
    box = size->asDouble();
    sizeEnum = nullptr;
  }
  if (sizeEnum == nullptr) out.erase("size");
  else out["size"] = sizeEnum;

  // REPLACES whatever style the node carried, as the JS fold this replaces did: the spinner's box is
  // the size translation's output and nothing else, and the app's own style lands on the centering
  // host one level up.
  dynamic sizeStyle = dynamic::object();
  sizeStyle["width"] = box;
  sizeStyle["height"] = box;
  out["style"] = std::move(sizeStyle);

  // RN defaults both to true and spells it `!== false`, so only a literal false turns them off. A
  // tag has no destructuring default, which is why the rule carries it.
  out["animating"] = boolAt(props, "animating").value_or(true);
  out["hidesWhenStopped"] = boolAt(props, "hidesWhenStopped").value_or(true);

  const dynamic *color = props.get_ptr("color");
  if (color == nullptr || !color->isString()) {
    if (isAndroidProgressBar) out.erase("color");
    else out["color"] = kSpinnerIosDefaultColor;
  }
  return out;
}

/**
 * Button's own platform half, over and above the touchable's (`Button.js:350-382`). It runs AFTER
 * `foldPressableProps`, which is the order the JS composition always had.
 *
 * Four rules, and every one is a function of the tag alone:
 *
 *   accessibilityRole          pinned to "button" (`:372`), spelled as a literal on the element —
 *                              not forwarded from the app, and there is no way to opt out
 *   importantForAccessibility  "no" becomes "no-hide-descendants" (`:357-361`). Only that ONE value
 *                              moves; the label lives inside the button, so plain "no" would leave
 *                              the text separately reachable
 *   touchSoundDisabled         re-spelled `android_disableSound` (`:377`)
 *   color                      stripped
 *
 * THE TWO STRIPS ARE THE HALF NOTHING ELSE CAN CATCH. Neither `touchSoundDisabled` nor `color` is
 * declared by any ViewConfig, so Fabric drops them without throwing, logging or painting
 * differently — the rename and the removal look identical to a screen whether or not they happen.
 *
 * `color` is erased from the PAYLOAD and never from the node: Button's derived folds (the label's
 * tint, the Android view style) read it off `propsOf(node)`, which this cannot reach. That
 * separation is what makes the strip safe here and unsafe one layer up.
 */
/**
 * Button's TITLE, as it is rendered: uppercase on Android, verbatim everywhere else
 * (`Button.js:352-353`).
 *
 * `#ifdef ANDROID` rather than a view-name branch, and for the reason `decelerationRate`'s constants
 * take one: there is no name to read. A raw text commits as `RCTRawText` on both platforms — unlike
 * `Switch`/`AndroidSwitch`, where the two platforms genuinely are two Fabric components and the wire
 * already says which. So the Android arm is unreachable headless, like `android_ripple`'s, and that
 * is a recorded gap rather than a hidden one.
 *
 * ASCII-only, deliberately, and it is upstream's own behaviour rather than a shortcut: RN calls
 * JavaScript's `String.prototype.toUpperCase`, which is full Unicode, so a Cyrillic or Greek label
 * uppercases there and would not here. Left ASCII because the alternative is dragging ICU into the
 * engine for a label that is uppercased only on Android, and a wrong-case label is a cosmetic
 * difference on one platform rather than a broken control. Recorded so it is a decision.
 */
dynamic foldButtonLabel(const dynamic &props) {
#ifdef ANDROID
  const dynamic *text = props.get_ptr("text");
  if (text == nullptr || !text->isString()) return props;
  std::string upper = text->asString();
  for (char &character : upper)
    character = static_cast<char>(
        std::toupper(static_cast<unsigned char>(character)));
  dynamic out = props;
  out["text"] = std::move(upper);
  return out;
#else
  return props;
#endif
}

/**
 * Button's own `disabled`, which is three questions where a plain touchable asks one:
 * `props.disabled ?? aria-disabled ?? accessibilityState.disabled` (`Button.js:331,337`).
 *
 * `??` and not `||`, which is the whole precedence: an EXPLICIT `disabled: false` beats an
 * `aria-disabled` that says otherwise, because the app's direct answer outranks the accessibility
 * hint. Presence decides at every step, so `false` is a real answer and stops the chain.
 *
 * Read off the AUTHORED bag, never off a folded one — see `foldButtonProps`.
 */
std::optional<bool> buttonDisabled(const dynamic &authored) {
  const std::optional<bool> direct = boolAt(authored, "disabled");
  if (direct.has_value()) return direct;
  const std::optional<bool> aria = boolAt(authored, "aria-disabled");
  if (aria.has_value()) return aria;
  const dynamic *state = authored.get_ptr("accessibilityState");
  if (state == nullptr || !state->isObject()) return std::nullopt;
  return boolAt(*state, "disabled");
}

/**
 * `authored` is `fabricProps`' own input — the bag BEFORE the aria fold, the id alias and the
 * pressable rule — and passing it is not a convenience.
 *
 * By the time this runs, `foldPressableProps` has folded `disabled` into `accessibilityState` and
 * ERASED the raw key, and `foldAriaProps` has folded `aria-disabled` into the same place. So the bag
 * this fold is handed can no longer tell an explicit `disabled: false` from an absent one, and the
 * `??` precedence above would collapse to whatever `accessibilityState` ended up holding. That is
 * Trap A, and it is the same correction the JS fold carried before the port, spelled
 * `projectionOf(propsOf(node))` for exactly this reason.
 */
// Button's label styling, `Button.js:404-430` (`styles.text` / `styles.textDisabled`). NOT a mirror
// of the JS constants that used to hold them: `resolveButtonTextStyle` and `buttonTextStyle` were
// deleted in the same commit, so these are the only copy.
constexpr double kButtonTextMargin = 8;
// Guarded by the same `#ifdef` as their only use: `-Wunused-const-variable` is an ERROR here
// (`-Werror`), so a platform constant compiled into the other platform's build does not merely sit
// unused, it fails the build.
#ifdef ANDROID
constexpr const char *kAndroidButtonText = "white";
constexpr const char *kAndroidButtonFontWeight = "500";
constexpr const char *kAndroidDisabledText = "#a1a1a1";
#else
constexpr const char *kIosButtonBlue = "#007AFF";
constexpr double kIosButtonFontSize = 18;
constexpr const char *kIosDisabledText = "#cdcdcd";
#endif

/**
 * Button's LABEL STYLE, on the `text` node the behavior builds (`Button.js:389-400`).
 *
 * THE ONLY RULE THAT READS AN ANCESTOR RATHER THAN A PARENT, and it has to: its inputs are the
 * BUTTON's `color` and `disabled`, and the button is this node's grandparent on iOS
 * (`button -> view -> text`) and its parent on Android. Asking for "the nearest button" rather than
 * "two up" is what makes one rule correct on both.
 *
 * NOT FOUND IS A REAL ANSWER and is left alone rather than defaulted: a `button-label-text` tag can
 * only be built by Button itself, so a miss means the tree was torn down around it mid-commit. A
 * default style would paint a stray label as a button.
 *
 * `color` tints the TEXT on iOS and the BUTTON on Android (`Button.js:318-324`), which is why the
 * tint is `#ifndef ANDROID` here and the same value lands on the view's style there. `disabled`
 * wins over the tint on both, because RN pushes the disabled colour after it.
 */
dynamic foldButtonLabelStyle(
    const dynamic &props,
    const IAncestorLookup &ancestors) {
  if (ancestors.find == nullptr) return props;
  const dynamic *owner = ancestors.find(ancestors.context, "button");
  if (owner == nullptr) return props;

  dynamic style = dynamic::object();
  style["textAlign"] = "center";
  style["margin"] = kButtonTextMargin;
#ifdef ANDROID
  style["color"] = kAndroidButtonText;
  style["fontWeight"] = kAndroidButtonFontWeight;
#else
  style["color"] = kIosButtonBlue;
  style["fontSize"] = kIosButtonFontSize;
  const dynamic *color = owner->get_ptr("color");
  if (color != nullptr && color->isString()) style["color"] = *color;
#endif

  const std::optional<bool> disabled = buttonDisabled(*owner);
  if (disabled.value_or(false)) {
#ifdef ANDROID
    style["color"] = kAndroidDisabledText;
#else
    style["color"] = kIosDisabledText;
#endif
  }

  dynamic out = props;
  out["style"] = std::move(style);
  // RN puts `disabled` on the Text as well (`Button.js:386`) — a real RCTText prop that Android's
  // accessibility layer reads, and a different thing from the greying above. ABSENT when none of the
  // three sources spoke, because that is what RN sends: `disabled={undefined}` is omitted, and
  // writing `false` would put a key on every button's label that upstream never emits.
  if (disabled.has_value()) out["disabled"] = *disabled;
  return out;
}

#ifdef ANDROID
// `TouchableNativeFeedback.js` via `Platform.Version >= 23` — foreground ripples need API 23.
constexpr int kAndroidForegroundMinVersion = 23;

// `Button.js:394-437`, one constant per literal so a value cannot drift silently.
constexpr int kAndroidButtonElevation = 4;
constexpr int kAndroidDisabledElevation = 0;
constexpr int kAndroidButtonBorderRadius = 2;
constexpr const char *kAndroidButtonBlue = "#2196F3";
constexpr const char *kAndroidDisabledBackground = "#dfdfdf";

/**
 * The running device's API level, and the one line of the Android branch a HOST build cannot have.
 *
 * `android_get_device_api_level` is the NDK's, so it exists when `__ANDROID__` is defined — which the
 * real toolchain sets and the test host's `-DANDROID` does not. That split is the point rather than
 * a workaround: the rule's LOGIC becomes testable in the Android arm of the test host
 * (`tests/CMakeLists.txt`, `SYMBIOTE_PLATFORM_ANDROID`) while the query itself stays the device's.
 *
 * The host answers with the minimum RN supports, so the arm exercises the branch an app on a modern
 * device takes. The other branch is reachable only on a device old enough to need it, which is where
 * it always was.
 */
int androidApiLevel() {
#ifdef __ANDROID__
  return android_get_device_api_level();
#else
  return kAndroidForegroundMinVersion;
#endif
}

// RN's `TouchableNativeFeedback.SelectableBackground()` with no ripple radius, which is what its
// body falls back to when the app passes no `background` (`:343-348`), and what Button's own view
// gets because TNF clones onto it (`:339`).
dynamic selectableItemBackground() {
  dynamic background = dynamic::object();
  background["type"] = "ThemeAttrAndroid";
  background["attribute"] = "selectableItemBackground";
  return background;
}
#endif

dynamic foldButtonProps(
    const dynamic &props,
    const dynamic &authored,
    bool hasPressListener) {
  dynamic out = props;
  out["accessibilityRole"] = "button";

  // The touchable's three-leg `focusable`, over the one-leg answer `foldPressableProps` just wrote.
  // `usesTouchableFocusableRule` excludes `button` so that this can be the layer that decides it —
  // the same order the JS composition had, where the owner's fold ran after the touchable's.
  out["focusable"] = boolAt(props, "focusable").value_or(true) &&
      hasPressListener && !buttonDisabled(authored).value_or(false);

  const dynamic *important = props.get_ptr("importantForAccessibility");
  if (important != nullptr && important->isString() &&
      important->asString() == "no") {
    out["importantForAccessibility"] = "no-hide-descendants";
  }

  const dynamic *sound = props.get_ptr("touchSoundDisabled");
  if (sound != nullptr) {
    out["android_disableSound"] = *sound;
    out.erase("touchSoundDisabled");
  }

  // `Button.js:394-437`'s `styles.button`, which is `{}` on iOS in every combination — the reason
  // the wrapping view looked droppable there and the reason this half is the only one that moved.
  //
  // OVERWRITTEN rather than composed, because RN's Button declares no `style` prop at all: there is
  // nothing for it to compose with. `authored`, not `props`, for `color` and `disabled` — by the
  // time this runs `foldPressableProps` has folded `disabled` into `accessibilityState` and erased
  // the raw key, so reading it here would resolve through the state and lose RN's
  // `props.disabled ?? aria ?? state.disabled` precedence. Same correction `focusable` needed above.
  //
  // The background is the touchable's: TNF renders no view and CLONES onto Button's
  // `<View style={buttonStyles}>` (`TouchableNativeFeedback.js:339`), so on this platform THIS node
  // is that view, and it gets the theme's selectable background with no foreground.
#ifdef ANDROID
  dynamic style = dynamic::object();
  style["elevation"] = kAndroidButtonElevation;
  style["borderRadius"] = kAndroidButtonBorderRadius;
  const std::string *color = stringAt(authored, "color");
  style["backgroundColor"] = color != nullptr ? *color : kAndroidButtonBlue;
  if (buttonDisabled(authored).value_or(false)) {
    style["elevation"] = kAndroidDisabledElevation;
    style["backgroundColor"] = kAndroidDisabledBackground;
  }
  out["style"] = std::move(style);
  out["nativeBackgroundAndroid"] = selectableItemBackground();
#endif

  out.erase("color");
  return out;
}

// `foldIdAlias` IS GONE (2026-09-18). The rename lives in `routeProp` now — ONE implementation where
// there were seven, and the reason it could not stay here is COVERAGE: a tag rule needs a non-empty
// `tagName`, which only a node with a registered behavior has, so this rule never reached a plain
// `<view>` or `<text>` and those are the commonest elements in any app. They were covered by the
// adapters' own folds instead, three of which were separate implementations.
//
// Moving it to the write seam also settled a divergence rather than only removing copies: Vue, Solid
// and Angular folded per key with no gate, so three of five adapters were already renaming `id` on
// third-party views while React and Svelte were not. Everybody gets upstream's answer now.
//
// Contract: `core/engine/cpp/tests/js/id-alias-coverage.itest.ts`.

/**
 * The props the press MACHINE consumes and the host must never see.
 *
 * A wrapper dropped them by DESTRUCTURING — they went into `createPressHandlers` and were simply
 * absent from the object it spread onto its View. A tag has no destructure, so every one of them
 * rode into the payload as a key no ViewConfig declares: a wire slot, an interned string and a
 * hashed `RawProps` entry apiece, per pressable, per commit.
 *
 * `hitSlop` is deliberately NOT here and belongs to the same prop family — it is a real native View
 * prop Fabric reads. `pressRetentionOffset` beside it is not.
 */
const std::array<const char *, 10> kPressableMachineKeys = {
    // RN's snapshot affordance (`Pressable.js:151,222`, `TouchableHighlight.js:61`). A JS-side
    // testing prop that no ViewConfig declares — listed here rather than erased by the one rule that
    // READS it, because all four tags carry the prop and only one paints from it.
    "testOnly_pressed",
    // Consumed below and replaced by the resolved `nativeBackgroundAndroid` /
    // `nativeForegroundAndroid`; the raw config is not a native prop.
    "android_ripple",
    "disabled",
    "cancelable",
    "delayLongPress",
    "minPressDuration",
    "unstable_pressDelay",
    "pressRetentionOffset",
    "delayHoverIn",
    "delayHoverOut",
};

/**
 * The Android native-feedback background, from the `android_ripple` config. `TouchableNativeFeedback`
 * is where the shape comes from; RN's own `Pressable` spreads `useAndroidRippleForView`'s `viewProps`
 * onto its OWN View (`Pressable.js:251`), which is why one node carries it and no inner view is
 * needed.
 *
 * The colour stays a STRING, as the JS this replaces left it: `nativeBackgroundAndroid` is a nested
 * object and the payload's colour processing is keyed on top-level names, so converting here would be
 * a change to the rule rather than a move of it. Android resolves the string; `null` is its
 * documented "no tint".
 *
 * STILL MISSING, and it always was: RN also dispatches `Commands.hotspotUpdate(x, y)` on
 * pressIn/pressMove and `Commands.setPressed` on pressIn/pressOut, which is what makes the ripple
 * originate at the touch point. Neither the old wrapper nor the behavior ever sent them.
 */
#ifdef ANDROID
void applyAndroidRipple(dynamic &out, const dynamic &config) {
  dynamic background = dynamic::object();
  background["type"] = "RippleAndroid";
  const std::string *color = stringAt(config, "color");
  background["color"] = color != nullptr ? dynamic(*color) : dynamic(nullptr);
  background["borderless"] = boolAt(config, "borderless").value_or(false);
  const dynamic *radius = config.get_ptr("radius");
  if (radius != nullptr && radius->isNumber()) background["rippleRadius"] = *radius;

  out[boolAt(config, "foreground").value_or(false) ? "nativeForegroundAndroid"
                                                  : "nativeBackgroundAndroid"] =
      std::move(background);
}
#endif

/**
 * Pressable's user-agent half, applied to the bag on its way to the payload.
 *
 * Every line is `Pressable.js` and none of it is any app's, any framework's or any instance's:
 *
 *   :257  `disabled` reaches a screen reader ONLY as `accessibilityState.disabled` — it is not a
 *         native View prop at all. Lowering once dropped this fold and nothing went red, because
 *         press suppression reads the node's own prop: the button behaved correctly and announced
 *         itself as enabled.
 *   :252  accessible unless the app opts OUT, and `!== false` rather than `?? true` — only a
 *         literal false opts out, an explicit `undefined` still reads as accessible.
 *   :258  the same shape for `focusable`, in its PLAIN form with no press-handler or disabled leg. A
 *         Touchable composing this tag has already resolved its own three-leg formula and passes the
 *         answer down as `focusable`, which `!== false` leaves alone — that is how the two compose
 *         without either knowing about the other.
 */
dynamic foldPressableProps(
    const dynamic &props,
    bool isTouchableFeedback,
    bool isTouchableFocusable,
    bool hasPressListener) {
  dynamic out = props;

  // Read BEFORE the machine keys are erased, and `!= null` rather than truthiness: an explicit
  // `disabled: false` is a real announcement, so it is presence and not value that decides.
  const std::optional<bool> disabled = boolAt(props, "disabled");
  if (disabled.has_value()) {
    const dynamic *authored = props.get_ptr("accessibilityState");
    dynamic state =
        authored != nullptr && authored->isObject() ? *authored : dynamic::object();
    state["disabled"] = *disabled;
    out["accessibilityState"] = std::move(state);
  }

  // Off Android there is nothing to resolve — `rippleProps` returned undefined there — and the
  // config is simply erased with the rest of the machine's keys below.
#ifdef ANDROID
  const dynamic *ripple = props.get_ptr("android_ripple");
  if (ripple != nullptr && ripple->isObject()) applyAndroidRipple(out, *ripple);
#endif

  for (const char *key : kPressableMachineKeys) out.erase(key);
  if (isTouchableFeedback) {
    for (const char *key : kTouchableFeedbackKeys) out.erase(key);
  }

  out["accessible"] = boolAt(props, "accessible").value_or(true);
  // `disabled` READ OFF `props`, the untouched input, and never off `out` — the erase loop above has
  // already taken the raw key out of `out`, so reading it there would resolve every disabled
  // touchable as focusable. That is a focus-order bug visible on a TV remote and in no test that
  // reads props; the JS fold this replaces carried the same correction, spelled `propOf(node, ...)`.
  out["focusable"] = isTouchableFocusable
      ? boolAt(props, "focusable").value_or(true) && hasPressListener &&
          !boolAt(props, "disabled").value_or(false)
      : boolAt(props, "focusable").value_or(true);
  return out;
}

/**
 * `TouchableNativeFeedback.js:349-390`, verbatim and in RN's own order. A CLOSED list, not a
 * passthrough: RN clones exactly these and nothing else, and it clones them WHATEVER their value —
 * `cloneElement` assigns every key of its config, so an owner with no `accessibilityLabel` CLEARS
 * the child's. Writing the key unconditionally is what reproduces that; `fabricProps` drops an
 * undefined on its way out, which is the same erasure the JS fold relied on.
 */
const std::array<const char *, 18> kNativeFeedbackClonedKeys = {
    "accessibilityHint",
    "accessibilityLanguage",
    "accessibilityLabel",
    "accessibilityRole",
    "accessibilityActions",
    "accessibilityValue",
    "importantForAccessibility",
    "accessibilityViewIsModal",
    "accessibilityLiveRegion",
    "accessibilityElementsHidden",
    "hasTVPreferredFocus",
    "hitSlop",
    "nextFocusDown",
    "nextFocusForward",
    "nextFocusLeft",
    "nextFocusRight",
    "nextFocusUp",
    "testID",
};

/**
 * `TouchableWithoutFeedback.js:281` — copied ONLY when set, which is the whole split from TNF's
 * unconditional clone. Reproducing the difference matters: an owner with no `testID` leaves the
 * child's standing here and erases it there, and RN's two bodies genuinely differ that way.
 */
const std::array<const char *, 10> kWithoutFeedbackWhenSetKeys = {
    "accessibilityActions",
    "accessibilityHint",
    "accessibilityLanguage",
    "accessibilityIgnoresInvertColors",
    "accessibilityLabel",
    "accessibilityRole",
    "accessibilityValue",
    "accessibilityViewIsModal",
    "hitSlop",
    "testID",
};

/**
 * `:253-276`, assigned whatever their value. Three of them are in RN's when-set list TOO, and the
 * later conditional copy can only re-assign what the aria fold already resolved — so they belong
 * here, where they clear.
 */
const std::array<const char *, 3> kWithoutFeedbackAlwaysKeys = {
    "accessibilityElementsHidden",
    "accessibilityLiveRegion",
    "importantForAccessibility",
};

bool usesCloneOntoChildRule(const char *ownerTag) {
  if (ownerTag == nullptr) return false;
  return std::strcmp(ownerTag, "touchable-native-feedback") == 0 ||
      std::strcmp(ownerTag, "touchable-without-feedback") == 0;
}

/**
 * `cloneElement(child, {…})` as a DESCENDANT rule: the child's own bag first, the owner's clone list
 * over it.
 *
 * This is the first rule keyed on the PARENT's tag rather than on the node's own, and the reason is
 * structural rather than convenient — see `IOwner`. Both touchables render no view, so the owner is
 * an anchor whose props reach Fabric nowhere else; the clone is not a decoration on the child, it is
 * the entire primitive.
 *
 * THE OWNER'S ARIA FOLD RUNS HERE, over the owner's bag. `fabricProps` folds aria for the node being
 * committed, and these props are on a node that is never committed — so without this an
 * `aria-label` on a TNF would reach nothing at all.
 */
dynamic foldCloneOntoChild(
    const dynamic &props, const IOwner &owner, bool isNativeFeedback) {
  if (owner.props == nullptr) return props;
  const bool foldsAria = hasAriaAlias(*owner.props);
  const dynamic ariaFolded = foldsAria ? foldAriaProps(*owner.props) : dynamic();
  const dynamic &source = foldsAria ? ariaFolded : *owner.props;

  dynamic out = props;
  if (isNativeFeedback) {
    for (const char *key : kNativeFeedbackClonedKeys) {
      const dynamic *value = source.get_ptr(key);
      if (value == nullptr) out.erase(key);
      else out[key] = *value;
    }
  } else {
    for (const char *key : kWithoutFeedbackWhenSetKeys) {
      const dynamic *value = source.get_ptr(key);
      if (value != nullptr) out[key] = *value;
    }
    for (const char *key : kWithoutFeedbackAlwaysKeys) {
      const dynamic *value = source.get_ptr(key);
      if (value == nullptr) out.erase(key);
      else out[key] = *value;
    }
  }

  // `:369-372` / `:253-276`. All four are the OWNER'S, which is the point: the child never saw any
  // of them, and `focusable`'s middle leg is a listener the owner owns and no bag can carry.
  const std::optional<bool> disabled = boolAt(source, "disabled");
  out["accessible"] = boolAt(source, "accessible").value_or(true);
  out["focusable"] = boolAt(source, "focusable").value_or(true) &&
      owner.hasPressListener && !disabled.value_or(false);
  // A STRING or nothing, which is the narrowing `stringOr` did — and "nothing" is an ERASE rather
  // than a null, because a cleared clone key reaches Fabric by being absent from the payload.
  const std::string *nativeID = stringAt(source, "nativeID");
  if (nativeID == nullptr) out.erase("nativeID");
  else out["nativeID"] = *nativeID;

  // `resolveDisabledAccessibilityState`: a present `disabled` MERGES over the owner's authored
  // state, an absent one passes that state through untouched. `!= null` and not truthiness — an
  // explicit `disabled: false` is a real announcement, the same reading `foldPressableProps` takes.
  const dynamic *authoredState = source.get_ptr("accessibilityState");
  if (disabled.has_value()) {
    dynamic state = authoredState != nullptr && authoredState->isObject()
        ? *authoredState
        : dynamic::object();
    state["disabled"] = *disabled;
    out["accessibilityState"] = std::move(state);
  } else if (authoredState == nullptr) {
    out.erase("accessibilityState");
  } else {
    out["accessibilityState"] = *authoredState;
  }

  // `:343-348` + `:402`. `getBackgroundProp` returns null off Android, so nothing is spread there —
  // and that branch is a compile-time one for the reason `android_ripple` already is: both
  // touchables commit an ordinary `RCTView`, so no component name can tell the platforms apart.
  //
  // The dict itself is the APP'S — `TouchableNativeFeedback.Ripple(...)` and its three siblings are
  // pure factories the app calls, so the rule only picks the default and the SLOT. That is why this
  // is not `applyAndroidRipple`, which builds `android_ripple`'s dict from scratch: here there is
  // nothing to build.
#ifdef ANDROID
  if (isNativeFeedback) {
    const dynamic *authored = source.get_ptr("background");
    dynamic background = authored != nullptr && authored->isObject()
        ? *authored
        : selectableItemBackground();
    // `canUseNativeForeground()` — RN's own guard, and `Platform.Version` on Android IS the API
    // level, so the JS check and this one read the same number.
    out[boolAt(source, "useForeground").value_or(false) &&
                androidApiLevel() >= kAndroidForegroundMinVersion
            ? "nativeForegroundAndroid"
            : "nativeBackgroundAndroid"] = std::move(background);
  }
#endif
  return out;
}

// The names Image CONSUMES rather than forwards. Every one is a W3C spelling or a size alias, and
// none is a Fabric prop — leaving one in the payload is how a reader concludes the rule ran when it
// did not. `source` is absent on purpose: it is consumed and then WRITTEN BACK, resolved.
const std::array<const char *, 8> kImageConsumedKeys = {
    "src",
    "srcSet",
    "crossOrigin",
    "referrerPolicy",
    "alt",
    "width",
    "height",
    "loadingIndicatorSource",
};

/**
 * The HTTP headers the two W3C aliases contribute to every source
 * (`ImageSourceUtils.js:40-46`). Empty is a real answer and is still attached on the `src`/`srcSet`
 * branches, because upstream pushes `{uri, headers, ...}` unconditionally there.
 */
dynamic imageHeaders(const dynamic &props) {
  dynamic headers = dynamic::object();
  const std::string *crossOrigin = stringAt(props, "crossOrigin");
  // `anonymous` is the default browser behaviour and contributes nothing — upstream checks for
  // `use-credentials` specifically.
  if (crossOrigin != nullptr && *crossOrigin == "use-credentials") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  const std::string *referrerPolicy = stringAt(props, "referrerPolicy");
  if (referrerPolicy != nullptr) headers["Referrer-Policy"] = *referrerPolicy;
  return headers;
}

/** Copy the size aliases onto a source entry, as upstream does for the `src` and `srcSet` shapes. */
void addSizeHints(dynamic &entry, const dynamic &props) {
  const dynamic *width = props.get_ptr("width");
  if (width != nullptr && width->isNumber()) entry["width"] = *width;
  const dynamic *height = props.get_ptr("height");
  if (height != nullptr && height->isNumber()) entry["height"] = *height;
}

/**
 * `srcSet` expanded into scaled sources — `ImageSourceUtils.js:48-79`.
 *
 * `src` fills the 1x slot ONLY when the set omits it: native picks by screen scale, so a missing 1x
 * is a blank image on a non-retina device and a duplicated one is undefined behaviour. A scale
 * token that is not `<n>x` is SKIPPED rather than guessed at — guessing fetches the wrong asset at
 * the wrong density, silently.
 */
dynamic expandSrcSet(
    const std::string &srcSet,
    const dynamic &props,
    const dynamic &headers) {
  dynamic sources = dynamic::array();
  bool useSrcForDefaultScale = true;

  for (size_t at = 0; at <= srcSet.size();) {
    const size_t end = std::min(srcSet.find(", ", at), srcSet.size());
    const std::string entry = srcSet.substr(at, end - at);
    at = end + 2;
    if (entry.empty()) continue;

    const size_t space = entry.find(' ');
    const std::string uri = entry.substr(0, space);
    const std::string token =
        space == std::string::npos ? "1x" : entry.substr(space + 1);
    if (token.empty() || token.back() != 'x') continue;
    char *parsedTo = nullptr;
    const long scale = std::strtol(token.c_str(), &parsedTo, 10);
    // `strtol` stops at the `x`, so a token that parsed nothing has no digits at all.
    if (parsedTo == token.c_str()) continue;
    if (scale == 1) useSrcForDefaultScale = false;

    dynamic source = dynamic::object();
    source["uri"] = uri;
    source["scale"] = static_cast<double>(scale);
    addSizeHints(source, props);
    source["headers"] = headers;
    sources.push_back(std::move(source));
  }

  const std::string *src = stringAt(props, "src");
  if (useSrcForDefaultScale && src != nullptr) {
    dynamic source = dynamic::object();
    source["uri"] = *src;
    source["scale"] = 1.0;
    addSizeHints(source, props);
    source["headers"] = headers;
    sources.push_back(std::move(source));
  }
  return sources;
}

/**
 * Which of `srcSet` / `src` / `source` native is actually shown — `ImageSourceUtils.js:47-89`, in
 * that precedence. An app migrating from the web writes `src` and would otherwise see nothing paint.
 *
 * `source` ARRIVES ALREADY RESOLVED: `routeProp` ran it through Metro's asset registry and
 * normalised it to an array on the way in (`image-source-write.ts`), because that registry is
 * JavaScript and there is none here. So this only chooses and decorates.
 */
dynamic resolveImageSources(const dynamic &props) {
  const dynamic headers = imageHeaders(props);

  const std::string *srcSet = stringAt(props, "srcSet");
  if (srcSet != nullptr) return expandSrcSet(*srcSet, props, headers);

  const std::string *src = stringAt(props, "src");
  if (src != nullptr) {
    dynamic source = dynamic::object();
    source["uri"] = *src;
    addSizeHints(source, props);
    source["headers"] = headers;
    return dynamic::array(std::move(source));
  }

  const dynamic *resolved = props.get_ptr("source");
  if (resolved == nullptr || !resolved->isArray()) return dynamic::array();

  // A header-decorated SINGLE object source gets them merged in (`:84`), so the aliases work on the
  // RN spelling too. The multi-entry and asset-id shapes pass through untouched, as upstream leaves
  // them.
  if (!headers.empty() && resolved->size() == 1 && resolved->at(0).isObject() &&
      stringAt(resolved->at(0), "uri") != nullptr) {
    dynamic only = resolved->at(0);
    only["headers"] = headers;
    return dynamic::array(std::move(only));
  }
  return *resolved;
}

/**
 * Image's user-agent half.
 *
 * The one rule that does NOT move whole, and the split is worth understanding: every line here is a
 * function of the tag, except the asset lookup that turns `require('./logo.png')` into a uri. That
 * one asks Metro's registry — a JS table populated at bundle time — so it happens at WRITE time
 * instead, the same seam and the same argument as `structured-style.ts`. By the time this runs, the
 * bag already holds resolved sources.
 */
dynamic foldImageProps(const dynamic &props) {
  dynamic out = props;
  out["source"] = resolveImageSources(props);

  // `ImageProps.js:195,202` — the size aliases are STYLE, not props, and an explicit style key wins.
  // RN spells it `{width, height}, ...style`, so they go UNDER.
  const dynamic *width = props.get_ptr("width");
  const dynamic *height = props.get_ptr("height");
  if (width != nullptr || height != nullptr) {
    dynamic sizes = dynamic::object();
    if (width != nullptr) sizes["width"] = *width;
    if (height != nullptr) sizes["height"] = *height;
    dynamic composed = dynamic::array(std::move(sizes));
    const dynamic *authored = props.get_ptr("style");
    if (authored != nullptr) composed.push_back(*authored);
    out["style"] = std::move(composed);
  }

  // RN accepts these two as style keys as well as props; reading only the prop drops a style
  // authors legitimately write.
  const dynamic *style = props.get_ptr("style");
  if (out.get_ptr("resizeMode") == nullptr && style != nullptr) {
    const dynamic *fromStyle = lastStyleValue(*style, "resizeMode");
    if (fromStyle != nullptr) out["resizeMode"] = *fromStyle;
  }
  if (out.get_ptr("tintColor") == nullptr && style != nullptr) {
    const dynamic *fromStyle = lastStyleValue(*style, "tintColor");
    if (fromStyle != nullptr) out["tintColor"] = *fromStyle;
  }

  // `alt` is the accessibility text (Image.ios.js / Image.android.js): it sets the label AND marks
  // the image accessible, which is what puts it in the reader's order at all. An explicit label
  // wins; an image with NO alt is left out of the order entirely, since a decorative image
  // announcing itself is noise a screen-reader user cannot skip.
  const std::string *alt = stringAt(props, "alt");
  if (alt != nullptr) {
    if (out.get_ptr("accessibilityLabel") == nullptr) {
      out["accessibilityLabel"] = *alt;
    }
    out["accessible"] = true;
  }

  // Android's loading indicator is a bare uri STRING under a different name, not the array shape
  // the main source uses. Sending the array paints no placeholder and says nothing.
  const dynamic *indicator = props.get_ptr("loadingIndicatorSource");
  if (indicator != nullptr && indicator->isArray() && indicator->size() > 0 &&
      indicator->at(0).isObject()) {
    const std::string *uri = stringAt(indicator->at(0), "uri");
    if (uri != nullptr) out["loadingIndicatorSrc"] = *uri;
  }

  for (const char *key : kImageConsumedKeys) out.erase(key);
  return out;
}

/** RN rounds the iOS background pill to this radius when `ios_backgroundColor` is set. */
constexpr double kIosSwitchBackgroundRadius = 16;

/**
 * Switch's user-agent half — and every authored name it reads is INVENTED.
 *
 * `trackColor`, `thumbColor` and `ios_backgroundColor` are not Fabric props. RN's Switch view
 * declares `onTintColor`/`tintColor` on iOS and `trackColorFor*`/`trackTintColor` on Android, plus
 * `thumbTintColor` on both, and `ios_backgroundColor` is not a prop at all — it is a STYLE
 * (`Switch.js:266-276`, a background plus a 16pt radius so the pill shows through the track).
 *
 * A wrapper body took those per-platform NAMES from an adapter-supplied table. A tag has no adapter
 * to ask, so the platform branch is here, once, instead of in five adapters.
 *
 * WRITES ONLY WHAT IT RESOLVES: an absent authored colour leaves its native name unset rather than
 * writing a null, which is what the payload builder would otherwise send as an explicit reset.
 */
dynamic foldSwitchProps(const dynamic &props, bool isAndroidSwitch) {
  dynamic out = props;

  // `value === true`, not a passthrough (`Switch.js:242,280`): the native prop is a boolean, and an
  // authored `undefined` must read as OFF. An uncontrolled switch painting ON is the worse failure.
  const bool isOn = boolAt(props, "value").value_or(false);

  const dynamic *trackColor = props.get_ptr("trackColor");
  const std::string *trackFalse = nullptr;
  const std::string *trackTrue = nullptr;
  if (trackColor != nullptr && trackColor->isObject()) {
    trackFalse = stringAt(*trackColor, "false");
    trackTrue = stringAt(*trackColor, "true");
  }

  const std::optional<bool> disabled = boolAt(props, "disabled");

  if (isAndroidSwitch) {
    // A DIFFERENT NATIVE COMPONENT WITH A DIFFERENT PROP SURFACE (`Switch.js:240-249`), which is
    // why the branch reads the view name rather than a compile-time macro: `AndroidSwitch` declares
    // `on` and `enabled`, and knows neither `value` nor `disabled`. Sending the iOS names here
    // painted an Android switch from nothing and left it impossible to disable.
    out["on"] = isOn;
    out.erase("value");

    // `:232` — the a11y state is the FALLBACK for `disabled`, so an app that only spells
    // `accessibilityState.disabled` still gets a switch it cannot toggle.
    const dynamic *authoredState = props.get_ptr("accessibilityState");
    const std::optional<bool> stateDisabled =
        authoredState != nullptr && authoredState->isObject()
        ? boolAt(*authoredState, "disabled")
        : std::nullopt;
    const bool isDisabled = disabled.value_or(stateDisabled.value_or(false));
    out["enabled"] = !isDisabled;
    out.erase("disabled");

    // `:235-238` — the resolved answer is written BACK, so the screen reader and the view agree.
    // Merged rather than replaced: an authored `busy` survives.
    if (stateDisabled != isDisabled) {
      dynamic state = authoredState != nullptr && authoredState->isObject()
          ? *authoredState
          : dynamic::object();
      state["disabled"] = isDisabled;
      out["accessibilityState"] = std::move(state);
    }

    if (trackFalse != nullptr) out["trackColorForFalse"] = *trackFalse;
    if (trackTrue != nullptr) out["trackColorForTrue"] = *trackTrue;
    const std::string *tint = isOn ? trackTrue : trackFalse;
    if (tint != nullptr) out["trackTintColor"] = *tint;
    // `:230` destructures the iOS colour names out of what reaches this view. They are keys it does
    // not declare.
    out.erase("onTintColor");
    out.erase("tintColor");
  } else {
    out["value"] = isOn;
    if (disabled.has_value()) out["disabled"] = *disabled;
    else out.erase("disabled");

    if (trackTrue != nullptr) out["onTintColor"] = *trackTrue;
    if (trackFalse != nullptr) out["tintColor"] = *trackFalse;

    // THE iOS STYLE COMPOSITION, and it is iOS's alone — `:266-276` is the `else` branch, so
    // Android's style is the app's untouched and `ios_backgroundColor` is not read there at all.
    //
    // The slot takes an ARRAY, which `addStyle` flattens in order, so this reproduces RN's nested
    // `StyleSheet.compose` exactly: `alignSelf` UNDER the app's style (an app that writes
    // `alignSelf: 'stretch'` still wins), the pill OVER it.
    const dynamic *authoredStyle = props.get_ptr("style");
    const std::string *iosBackground = stringAt(props, "ios_backgroundColor");
    dynamic composed = dynamic::array();
    dynamic intrinsic = dynamic::object();
    // `:267` — a stock iOS switch keeps its intrinsic width instead of stretching to its
    // container's cross axis. Omitting it made every one of ours stretch.
    intrinsic["alignSelf"] = "flex-start";
    composed.push_back(std::move(intrinsic));
    if (authoredStyle != nullptr) composed.push_back(*authoredStyle);
    if (iosBackground != nullptr) {
      dynamic pill = dynamic::object();
      pill["backgroundColor"] = *iosBackground;
      pill["borderRadius"] = kIosSwitchBackgroundRadius;
      composed.push_back(std::move(pill));
    }
    out["style"] = std::move(composed);
  }

  // `:255,293` — both platforms, and a `??` rather than an override: an app that calls its switch a
  // checkbox keeps its own answer. Without this a screen reader announces the control as a plain
  // view, with nothing visual to notice.
  if (out.get_ptr("accessibilityRole") == nullptr) {
    out["accessibilityRole"] = "switch";
  }

  const std::string *thumbColor = stringAt(props, "thumbColor");
  if (thumbColor != nullptr) out["thumbTintColor"] = *thumbColor;

  // None of the three authored names is a native prop, and leaving one in the payload is how a
  // reader concludes the rule ran when it did not.
  out.erase("trackColor");
  out.erase("thumbColor");
  out.erase("ios_backgroundColor");
  return out;
}

} // namespace

dynamic fabricProps(
    const std::string &component,
    const std::string &tagName,
    const dynamic &props,
    const IPayloadFold &fold,
    const IOwner &owner,
    const ISelf &self,
    const IAncestorLookup &ancestors,
    const IFirstChild &firstChild) {
  if (component == kRawTextComponent) {
    dynamic out = dynamic::object();
    const dynamic *text = props.get_ptr("text");
    if (text != nullptr) out["text"] = *text;
    // THE ONE TAG RULE ON THIS PATH, and a raw text is a stranger place for one than it looks. It
    // has no props an app can write — the object above is the whole payload — but its CONTENT can
    // still be the platform's decision rather than the app's, which is exactly what Button's title
    // is: rendered uppercase on Android and verbatim everywhere else (`Button.js:352-353`). That is
    // a user-agent choice about a control, so it belongs here and not in the app's string.
    //
    // Guarded on the tag rather than applied to every raw text, obviously — and the tag reaches a
    // raw text at all because `createRawText` now takes one, for this.
    if (tagName == "button-label") out = foldButtonLabel(out);
    return out;
  }

  // THE ONE POINT WHERE THE WHOLE BAG IS KNOWN ON EVERY PATH, which is what the aria fold needs:
  // `aria-checked` has to be folded against a sibling `accessibilityState`, and a per-key write path
  // sees one key at a time. Both commit paths — create and clone — reach here, so a lowered element
  // gets the fold it has no wrapper to run.
  //
  // Threaded as a POINTER rather than a value, which is this side's version of the reference
  // returning its input by identity: a fold that has nothing to do must not copy the bag, and this
  // runs once per node per commit.
  const dynamic *bag = &props;

  dynamic aliasFolded;
  if (hasAriaAlias(props)) {
    aliasFolded = foldAriaProps(props);
    bag = &aliasFolded;
  }

  // The TAG's own platform props, in the slot the behavior's JS fold used to occupy — after the aria
  // fold and before anything else, because that order is load-bearing and always was: the aria fold
  // writes `accessibilityState` from `aria-disabled`, and this resolves that against `disabled`.
  // Swapped, whichever ran second would silently win.
  dynamic tagResolved;
  if (usesPressableRule(tagName)) {
    tagResolved = foldPressableProps(
        *bag,
        usesTouchableFeedbackRule(tagName),
        usesTouchableFocusableRule(tagName),
        self.hasPressListener);
    // The UNDERLAY, layered over the touchable's own rule and only on the one tag that has one. It
    // runs AFTER `foldPressableProps` deliberately: that rule strips `underlayColor` and
    // `activeOpacity`, so this reads them off the AUTHORED bag — Trap A, the same correction every
    // rule that follows another has needed.
    if (tagName == "touchable-highlight")
      tagResolved = foldTouchableHighlightUnderlay(tagResolved, props, self);
    // Button is a touchable PLUS something, exactly as RN builds it (`Button.js:283`), so its own
    // rules layer over the touchable's rather than replacing them.
    if (tagName == "button")
      tagResolved = foldButtonProps(tagResolved, props, self.hasPressListener);
    bag = &tagResolved;
  } else if (tagName == "image" || tagName == "image-background-image") {
    tagResolved = foldImageProps(*bag);
    // The background's inner image is an image PLUS a fill, and the order is the recorded
    // divergence from RN preserved exactly: the image rule folds this node's own `width`/`height`
    // props under its style FIRST, and the box proxied from the owner layers over that. RN nests it
    // the other way (`ImageBackground.js:83-98`); the decision is pinned in
    // `core/components/src/behaviors/image-background.test.ts` and moving the fold does not reopen it.
    if (tagName == "image-background-image")
      tagResolved = foldImageBackgroundImageProps(tagResolved, owner.props);
    bag = &tagResolved;
  } else if (tagName == "button-label-text") {
    tagResolved = foldButtonLabelStyle(*bag, ancestors);
    bag = &tagResolved;
  } else if (tagName == "scroll-view" || tagName == "horizontal-scroll-view") {
    // The parent's TAG decides which composition this is — the descendant seam again, read from the
    // other end. A scroll view whose parent is a refresh control is WRAPPED (Android's claim mode),
    // and it keeps only the visual half of its own style.
    tagResolved = foldScrollViewProps(
        *bag,
        tagName == "horizontal-scroll-view",
        owner.tagName != nullptr && std::strcmp(owner.tagName, "refresh-control") == 0);
    bag = &tagResolved;
  } else if (tagName == "refresh-control") {
    tagResolved = foldRefreshWrapperProps(*bag, firstChild);
    bag = &tagResolved;
  } else if (
      tagName == "scroll-content" || tagName == "horizontal-scroll-content") {
    tagResolved = foldScrollContentProps(
        *bag, tagName == "horizontal-scroll-content", owner.props);
    bag = &tagResolved;
  } else if (tagName == "image-background") {
    tagResolved = foldImageBackgroundProps(*bag);
    bag = &tagResolved;
  } else if (tagName == "activity-indicator") {
    tagResolved = foldActivityIndicatorProps(*bag);
    bag = &tagResolved;
  } else if (tagName == "sticky-header") {
    tagResolved = foldStickyHeaderProps(*bag);
    bag = &tagResolved;
  } else if (tagName == "activity-indicator-spinner") {
    tagResolved = foldActivityIndicatorSpinnerProps(
        *bag, component == kAndroidProgressBar);
    bag = &tagResolved;
  } else if (tagName == "switch") {
    // The COMPONENT decides the platform half, not a compile-time macro: `Switch` and
    // `AndroidSwitch` are two native components with two prop surfaces, and the name is already
    // here. It also makes both halves reachable from one test build.
    tagResolved = foldSwitchProps(*bag, component == kAndroidSwitchComponent);
    bag = &tagResolved;
  }

  // THE DESCENDANT RULE, and it is its own step rather than an arm of the chain above because it is
  // keyed on a different thing. Every branch up there asks "what tag am I"; this asks "what tag
  // contains me", and a node can answer both — a `<pressable>` under a TouchableWithoutFeedback gets
  // its own rule AND the clone, in that order, which is the order RN composes them in.
  //
  // One `strcmp` against a usually-empty parent tag per node, placed after the chain so the common
  // case pays only that.
  dynamic ownerResolved;
  if (usesCloneOntoChildRule(owner.tagName)) {
    ownerResolved = foldCloneOntoChild(
        *bag, owner, std::strcmp(owner.tagName, "touchable-native-feedback") == 0);
    bag = &ownerResolved;
  }

  // The behavior's own fold, BETWEEN the two, which is where the reference runs it
  // (`fabric-props.ts`: aria -> payloadFold -> value). The order is not cosmetic: the aria fold
  // writes `accessibilityState` from `aria-disabled`, and Pressable's fold then resolves that
  // against its own `disabled`. Swapped, whichever ran second would silently win.
  // The fold's return REPLACES the bag, which is what makes a removal expressible at all — a fold
  // drops a key by not putting it back. That is also what makes it expensive: every fold returns
  // `{ ...props, ...whatItChanged }`, and reading the result back here is `jsi::dynamicFromValue`,
  // a `getPropertyNames` plus a `getString` and a `std::string` allocation per key. Measured at
  // 13.3 ms of a 17.8 ms fold phase, against 1.6 ms to send the bag out and 1.6 ms to run the fold.
  // `core/engine/src/__tests__/payload-fold-merge.test.ts` holds the numbers and why merging a patch
  // instead — the obvious cut — does not fit yet.
  dynamic behaviorFolded;
  if (fold) {
    behaviorFolded = fold(*bag);
    bag = &behaviorFolded;
  }

  dynamic valueFolded;
  const bool isTextInput =
      component == kSinglelineTextInput || component == kMultilineTextInput;
  if (isTextInput &&
      (bag->get_ptr("value") != nullptr || bag->get_ptr("defaultValue") != nullptr)) {
    valueFolded = foldTextInputValue(*bag);
    bag = &valueFolded;
  }

  // TextInput's web spelling resolved into RN's own — the UA rule, moved off a JS `payloadFold`.
  // See `foldTextInputAliases`. Unconditional because `submitBehavior` is produced for an empty bag,
  // which is what makes this a rule rather than a mapping.
  dynamic aliasResolved;
  if (isTextInput) {
    aliasResolved = foldTextInputAliases(*bag, component == kMultilineTextInput);
    bag = &aliasResolved;
  }

  // RN's two Text defaults (`Text.js:289` and `:291`), applied here so no adapter has to write them
  // as props. Three of them used to (`seedTextDefaults` in Vue, Angular and Solid): both keys landed
  // on every text node at `createElement`, the app then authored the same values, and each write
  // crossed into this host, converted to a `folly::dynamic` and was dropped for equalling what was
  // already there — 6 000 wasted crossings per 1 000-row create, measured with `writesOfUnchanged`.
  //
  // LAST of the component-keyed folds, so a behavior's own fold still gets to set either key and win.
  // A fallback and never an override, and `!= false` rather than "is missing": RN treats an explicit
  // `undefined` and an absent prop alike, and only a literal `false` opts out. The twin of this rule
  // is `applyTextDefaults` in `core/engine/src/fabric-props.ts`, and
  // `core/engine/src/__tests__/text-payload-defaults.test.ts` is what keeps the two copies honest.
  dynamic textDefaulted;
  if (component == kTextComponent) {
    textDefaulted = *bag;
    const dynamic *ellipsize = textDefaulted.get_ptr("ellipsizeMode");
    if (ellipsize == nullptr || ellipsize->isNull()) {
      textDefaulted["ellipsizeMode"] = "tail";
    }
    const dynamic *scaling = textDefaulted.get_ptr("allowFontScaling");
    const bool optedOut =
        scaling != nullptr && scaling->isBool() && scaling->getBool() == false;
    textDefaulted["allowFontScaling"] = !optedOut;
    bag = &textDefaulted;
  }

  const dynamic &folded = *bag;
  dynamic out = dynamic::object();
  for (const auto &pair : folded.items()) {
    if (!pair.first.isString()) continue;
    const std::string &key = pair.first.getString();
    if (key == "style") continue;
    out[key] = processValue(key, pair.second);
  }
  // Hoist the style slot (object | array | nested arrays) into the SAME payload object — no
  // intermediate flatten. See `addStyle`.
  const dynamic *style = folded.get_ptr("style");
  if (style != nullptr) addStyle(out, *style);
  return out;
}

} // namespace symbiote
