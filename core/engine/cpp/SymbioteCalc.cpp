#include "SymbioteCalc.h"

#include <algorithm>
#include <cmath>

#include "SymbioteMath.h"

namespace symbiote {

bool isCalcText(std::string_view text) {
  return startsWithMathCall(text);
}

namespace {

double usedValue(double number) {
  if (std::isnan(number)) return 0;
  return std::clamp(number, -kLargestUsedValue, kLargestUsedValue);
}

} // namespace

std::optional<CalcResult> evaluateCalc(std::string_view text) {
  if (!isCalcText(text)) return std::nullopt;
  const std::optional<MathValue> value = parseMath(text);
  if (!value.has_value() || value->isOpaque) return std::nullopt;
  const std::optional<Dimension> dimension = mathDimension(value->type);
  if (dimension == Dimension::kNumber) return CalcResult{usedValue(value->amount), CalcKind::kNumber};
  if (dimension == Dimension::kLength) return CalcResult{usedValue(value->amount), CalcKind::kLength};
  if (dimension == Dimension::kPercent) return CalcResult{usedValue(value->percent), CalcKind::kPercent};
  return std::nullopt;
}

} // namespace symbiote
