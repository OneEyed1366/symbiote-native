#include "SymbioteFabricProps.h"

#include <algorithm>
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

} // namespace

dynamic fabricProps(
    const std::string &component,
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

  // The behavior's own fold, BETWEEN the two, which is where the reference runs it
  // (`fabric-props.ts`: aria -> payloadFold -> value). The order is not cosmetic: the aria fold
  // writes `accessibilityState` from `aria-disabled`, and Pressable's fold then resolves that
  // against its own `disabled`. Swapped, whichever ran second would silently win.
  dynamic behaviorFolded;
  if (fold) {
    behaviorFolded = fold(*bag);
    bag = &behaviorFolded;
  }

  dynamic valueFolded;
  if ((component == kSinglelineTextInput || component == kMultilineTextInput) &&
      (bag->get_ptr("value") != nullptr || bag->get_ptr("defaultValue") != nullptr)) {
    valueFolded = foldTextInputValue(*bag);
    bag = &valueFolded;
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
