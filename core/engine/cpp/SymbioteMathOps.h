#pragma once

#include <optional>
#include <string_view>
#include <vector>

#include "SymbioteMath.h"

namespace symbiote {

enum class RoundStrategy { kNearest, kUp, kDown, kToZero };

// The arguments of one math function call, `nullopt` standing for the `none` of `clamp`
struct MathCall {
  std::vector<std::optional<MathValue>> args;
  RoundStrategy strategy = RoundStrategy::kNearest;
};

// `nullopt` when the two types may not meet in the operation or the result is not finite
std::optional<MathValue> sumValues(const MathValue &left, const MathValue &right, bool isSubtraction);
std::optional<MathValue> multiplyValues(const MathValue &left, const MathValue &right);
std::optional<MathValue> divideValues(const MathValue &left, const MathValue &right);

// The name is in lower case
// `nullopt` is an unknown name, a wrong count or type, or a result that is not finite
std::optional<MathValue> callMathFunction(std::string_view name, const MathCall &call);

bool isMathFunction(std::string_view name);

} // namespace symbiote
