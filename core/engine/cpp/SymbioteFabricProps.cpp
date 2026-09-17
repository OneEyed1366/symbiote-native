#include "SymbioteFabricProps.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdlib>
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
dynamic foldButtonProps(const dynamic &props) {
  dynamic out = props;
  out["accessibilityRole"] = "button";

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

  out.erase("color");
  return out;
}

/**
 * `nativeID={this.props.id ?? this.props.nativeID}` — RN's W3C alias, spelled identically by every
 * component that accepts both (`View.js:77-79`, `TouchableOpacity.js:326`,
 * `TouchableHighlight.js:375`). The alias WINS when both are set and falls back when it is absent.
 *
 * WHY IT IS SAFE TO APPLY TO EVERY TAG, which is the question that kept it in five separate JS
 * folds: `tagName` is written only by `attachHostBehavior`, so it is non-empty ONLY for our own
 * primitives. A third-party native view — one that might legitimately declare its own `id`
 * attribute — never carries a tag and never reaches this. The rule's blast radius is exactly the
 * set of tags we define.
 *
 * Idempotent, and that is what lets it coexist with the adapters that still alias on their way in:
 * a bag already carrying `nativeID` and no `id` is returned untouched.
 */
dynamic foldIdAlias(const dynamic &props) {
  dynamic out = props;
  const dynamic *id = props.get_ptr("id");
  // `??`, so a null `id` falls through to an authored `nativeID` rather than erasing it. The raw key
  // leaves either way — no ViewConfig declares `id`, so Fabric would drop it and the nativeID would
  // be lost on device with nothing red in any suite.
  if (id != nullptr && !id->isNull()) out["nativeID"] = *id;
  out.erase("id");
  return out;
}

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
const std::array<const char *, 9> kPressableMachineKeys = {
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
dynamic foldPressableProps(const dynamic &props, bool isTouchableFeedback) {
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
  out["focusable"] = boolAt(props, "focusable").value_or(true);
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
    const IPayloadFold &fold) {
  if (component == kRawTextComponent) {
    dynamic out = dynamic::object();
    const dynamic *text = props.get_ptr("text");
    if (text != nullptr) out["text"] = *text;
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
  // The `id` alias first, and for EVERY tag rather than for a list of them — see `foldIdAlias` for
  // why a rule keyed on "carries a tag at all" cannot reach a third-party view. Guarded on presence
  // so a bag with no `id`, which is nearly all of them, is not copied.
  dynamic idResolved;
  if (bag->get_ptr("id") != nullptr && !tagName.empty()) {
    idResolved = foldIdAlias(*bag);
    bag = &idResolved;
  }

  dynamic tagResolved;
  if (usesPressableRule(tagName)) {
    tagResolved = foldPressableProps(*bag, usesTouchableFeedbackRule(tagName));
    // Button is a touchable PLUS something, exactly as RN builds it (`Button.js:283`), so its own
    // rules layer over the touchable's rather than replacing them.
    if (tagName == "button") tagResolved = foldButtonProps(tagResolved);
    bag = &tagResolved;
  } else if (tagName == "image") {
    tagResolved = foldImageProps(*bag);
    bag = &tagResolved;
  } else if (tagName == "activity-indicator") {
    tagResolved = foldActivityIndicatorProps(*bag);
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
