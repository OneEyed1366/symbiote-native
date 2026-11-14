#include "SymbioteSyntaxNumber.h"

#include <cctype>
#include <cstdlib>
#include <string>

#include "SymbioteMath.h"

namespace symbiote {

namespace {

bool isDigit(char at) {
  return std::isdigit(static_cast<unsigned char>(at)) != 0;
}

// The end of the number at `from`, `[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?`, or npos
size_t numberEnd(std::string_view text, size_t from, bool &hasFraction) {
  size_t at = from;
  hasFraction = false;
  if (at < text.size() && (text[at] == '+' || text[at] == '-')) ++at;
  const size_t digitsFrom = at;
  while (at < text.size() && isDigit(text[at])) ++at;
  if (at + 1 < text.size() && text[at] == '.' && isDigit(text[at + 1])) {
    hasFraction = true;
    at += 2;
    while (at < text.size() && isDigit(text[at])) ++at;
  }
  if (at == digitsFrom) return std::string_view::npos;
  if (at < text.size() && (text[at] == 'e' || text[at] == 'E')) {
    size_t exponent = at + 1;
    if (exponent < text.size() && (text[exponent] == '+' || text[exponent] == '-')) ++exponent;
    if (exponent < text.size() && isDigit(text[exponent])) {
      hasFraction = true;
      while (exponent < text.size() && isDigit(text[exponent])) ++exponent;
      at = exponent;
    }
  }
  return at;
}

// A number, a dimension or a percentage from `from`, advancing `from` past it
std::optional<TypedValue> literalAt(std::string_view text, size_t &from) {
  bool hasFraction = false;
  const size_t end = numberEnd(text, from, hasFraction);
  if (end == std::string_view::npos) return std::nullopt;
  const double number = std::strtod(std::string(text.substr(from, end - from)).c_str(), nullptr);
  TypedValue value{Dimension::kNumber};
  value.isLiteral = true;
  value.isZero = number == 0;
  value.isInteger = !hasFraction;
  value.isNegative = number < 0;
  size_t unitEnd = end;
  if (end < text.size() && text[end] == '%') {
    value.dimension = Dimension::kPercent;
    ++unitEnd;
  } else {
    while (unitEnd < text.size() && std::isalpha(static_cast<unsigned char>(text[unitEnd])) != 0) ++unitEnd;
  }
  if (unitEnd > end && value.dimension != Dimension::kPercent) {
    const std::optional<MathUnit> unit = mathUnit(text.substr(end, unitEnd - end));
    if (!unit.has_value()) return std::nullopt;
    value.dimension = unit->dimension;
    value.isRelative = unit->isRelative;
    value.isInteger = false;
  }
  from = unitEnd;
  return value;
}

// A `calc()` or math function is typed by what it computes to, its amount being no concern here
std::optional<TypedValue> mathTyped(std::string_view text) {
  const std::optional<MathValue> value = parseMath(text);
  if (!value.has_value()) return std::nullopt;
  const std::optional<Dimension> dimension = mathDimension(value->type);
  if (!dimension.has_value()) return std::nullopt;
  TypedValue typed{*dimension};
  typed.isRelative = value->isRelative;
  return typed;
}

} // namespace

std::optional<TypedValue> typedValue(std::string_view text) {
  if (startsWithMathCall(text)) return mathTyped(text);
  size_t at = 0;
  const std::optional<TypedValue> literal = literalAt(text, at);
  if (!literal.has_value() || at != text.size()) return std::nullopt;
  return literal;
}

} // namespace symbiote
