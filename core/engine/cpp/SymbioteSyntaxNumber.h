#pragma once

#include <optional>
#include <string_view>

namespace symbiote {

// What a number, a dimension, a percentage or a `calc()` over them is, as the registry types it
enum class Dimension { kNumber, kLength, kPercent, kLengthPercent, kAngle, kTime, kResolution };

struct TypedValue {
  Dimension dimension;
  // `em`, `rem`, `ex`, `ch` and the like, which a computed value would turn into pixels
  bool isRelative = false;
  bool isLiteral = false;
  bool isZero = false;
  bool isInteger = false;
  bool isNegative = false;
};

// `nullopt` when the text is neither of those, or a `calc()` that mixes types it may not
std::optional<TypedValue> typedValue(std::string_view text);

} // namespace symbiote
