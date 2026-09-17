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

/** The bool a key holds, or null when it is absent or is not a bool. */
const bool *boolAt(const dynamic &props, const char *key) {
  const dynamic *found = props.get_ptr(key);
  if (found == nullptr || !found->isBool()) return nullptr;
  static thread_local bool held = false;
  held = found->getBool();
  return &held;
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
    const bool *blurOnSubmit,
    bool isMultiline) {
  if (submitBehavior != nullptr) {
    if (!isMultiline && *submitBehavior == "newline") return "blurAndSubmit";
    return *submitBehavior;
  }
  if (isMultiline) {
    return blurOnSubmit != nullptr && *blurOnSubmit ? "blurAndSubmit" : "newline";
  }
  return blurOnSubmit != nullptr && !*blurOnSubmit ? "submit" : "blurAndSubmit";
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
  const bool *readOnly = boolAt(props, "readOnly");
  if (readOnly != nullptr && out.get_ptr("editable") == nullptr) {
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
      tagName == "button";
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
  const bool *borderless = boolAt(config, "borderless");
  background["borderless"] = borderless != nullptr && *borderless;
  const dynamic *radius = config.get_ptr("radius");
  if (radius != nullptr && radius->isNumber()) background["rippleRadius"] = *radius;

  const bool *foreground = boolAt(config, "foreground");
  out[foreground != nullptr && *foreground ? "nativeForegroundAndroid"
                                           : "nativeBackgroundAndroid"] = std::move(background);
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
dynamic foldPressableProps(const dynamic &props) {
  dynamic out = props;

  // Read BEFORE the machine keys are erased, and `!= null` rather than truthiness: an explicit
  // `disabled: false` is a real announcement, so it is presence and not value that decides.
  const bool *disabled = boolAt(props, "disabled");
  if (disabled != nullptr) {
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

  const bool *accessible = boolAt(props, "accessible");
  out["accessible"] = accessible == nullptr || *accessible;
  const bool *focusable = boolAt(props, "focusable");
  out["focusable"] = focusable == nullptr || *focusable;
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
  dynamic tagResolved;
  if (usesPressableRule(tagName)) {
    tagResolved = foldPressableProps(*bag);
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
