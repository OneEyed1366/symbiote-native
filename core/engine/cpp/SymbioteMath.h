#pragma once

#include <optional>
#include <string_view>

#include "SymbioteSyntaxNumber.h"

namespace symbiote {

// The exponent of each base dimension, so `px * px` is length 2 and `1 / px` is length -1
// `hasPercent` marks a percentage part, which only a length may sit beside
struct MathType {
  int length = 0;
  int angle = 0;
  int time = 0;
  int resolution = 0;
  bool hasPercent = false;
};

// An amount in the base unit of its dimension (px, deg, s, dppx) beside the percentage part
// An opaque value has a type and no known amount, like `vw` or a percentage set against a length
struct MathValue {
  MathType type;
  double amount = 0;
  double percent = 0;
  bool isOpaque = false;
  // A font or container relative unit, which a computed value would turn into pixels
  bool isRelative = false;
};

struct MathUnit {
  Dimension dimension;
  double scale;
  bool isRelative;
  bool isOpaque;
};

// `nullopt` for a unit the engine does not know
std::optional<MathUnit> mathUnit(std::string_view unit);

// Whether the text opens with `calc(` or the call of a math function
bool startsWithMathCall(std::string_view text);

// A literal, a `calc()` or a math function over them, as the whole text
// `nullopt` is a syntax error, a type error or a result that is not finite
std::optional<MathValue> parseMath(std::string_view text);

// The dimension a result is known by, `nullopt` for one nothing names (`px * px`)
std::optional<Dimension> mathDimension(const MathType &type);

} // namespace symbiote
