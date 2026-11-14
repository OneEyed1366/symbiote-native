#pragma once

#include <optional>
#include <string_view>

namespace symbiote {

// The root font size `rem` and `em` resolve against, as the compiler's default
constexpr double kRemInPixels = 16;

// What an infinite result is used as, the largest length a browser lays out, and NaN is used as 0
constexpr double kLargestUsedValue = 33'554'428;

enum class CalcKind { kNumber, kLength, kPercent };

// A length is in pixels, a percentage in percent points
struct CalcResult {
  double value;
  CalcKind kind;
};

// Evaluates one `calc(...)` or math function call down to a number, a length or a percentage
// `nullopt` is invalid: a type error, a percentage mixed with a length, a unit of unknown size
std::optional<CalcResult> evaluateCalc(std::string_view text);

// Whether the text opens with `calc(` or the call of a math function, valid or not
bool isCalcText(std::string_view text);

} // namespace symbiote
