#include "SymbioteComputedValue.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <optional>

#include "SymbioteMath.h"
#include "SymbioteSyntaxNumber.h"
#include "SymbioteSyntaxValue.h"

namespace symbiote {

namespace {

constexpr int kSignificantDigits = 6;
constexpr double kByteMax = 255;

// An amount in the base unit of its dimension (px, deg, s, dppx, or the plain number) beside a
// percentage part, which only a length may carry
struct Quantity {
  Dimension dimension;
  double amount;
  double percent;
};

// The value of a literal, a `calc()` or a math function, `nullopt` when its size is not known
std::optional<Quantity> quantityOf(std::string_view text) {
  const std::optional<MathValue> value = parseMath(text);
  if (!value.has_value() || value->isOpaque) return std::nullopt;
  const std::optional<Dimension> dimension = mathDimension(value->type);
  if (!dimension.has_value()) return std::nullopt;
  return Quantity{*dimension, value->amount, value->percent};
}

// Up to six significant digits, no exponent and no trailing zeros, as a browser serializes a number
std::string numberText(double value) {
  if (value == 0) return "0";
  char buffer[64];
  std::snprintf(buffer, sizeof buffer, "%.*g", kSignificantDigits, value);
  std::string text(buffer);
  if (text.find('e') == std::string::npos) return text;
  std::snprintf(buffer, sizeof buffer, "%.*f", kSignificantDigits, value);
  text = buffer;
  text.erase(text.find_last_not_of('0') + 1);
  if (text.back() == '.') text.pop_back();
  return text;
}

const char *unitSuffix(Dimension dimension) {
  switch (dimension) {
    case Dimension::kLength:
      return "px";
    case Dimension::kAngle:
      return "deg";
    case Dimension::kTime:
      return "s";
    case Dimension::kResolution:
      return "dppx";
    default:
      return "";
  }
}

// A length and a percentage that cannot fold into one stay as a two term `calc()`
std::string lengthPercentText(const Quantity &quantity) {
  if (quantity.amount == 0) return numberText(quantity.percent) + "%";
  const bool isNegative = quantity.amount < 0;
  return "calc(" + numberText(quantity.percent) + "% " + (isNegative ? "- " : "+ ") +
      numberText(std::fabs(quantity.amount)) + "px)";
}

bool isFinite(const Quantity &quantity) {
  return std::isfinite(quantity.amount) && std::isfinite(quantity.percent);
}

// The part a length with a percentage writes when one of them is not finite, NaN first
bool isPercentPart(const Quantity &quantity) {
  if (quantity.dimension == Dimension::kPercent) return true;
  if (quantity.dimension != Dimension::kLengthPercent) return false;
  return !std::isnan(quantity.amount) && std::isfinite(quantity.amount) && !std::isfinite(quantity.percent);
}

std::string nonFiniteWord(double part, bool isNaN) {
  if (isNaN) return "NaN";
  return part > 0 ? "infinity" : "-infinity";
}

std::string nonFiniteUnit(const Quantity &quantity, bool isPercent) {
  if (isPercent) return "%";
  if (quantity.dimension == Dimension::kLengthPercent) return "px";
  return unitSuffix(quantity.dimension);
}

// A NaN or an infinity has no digits to write, so it stays a `calc()` of one base unit
std::string nonFiniteText(const Quantity &quantity) {
  const bool isPercent = isPercentPart(quantity);
  const bool isNaN = std::isnan(quantity.amount) || std::isnan(quantity.percent);
  const std::string word = nonFiniteWord(isPercent ? quantity.percent : quantity.amount, isNaN);
  const std::string unit = nonFiniteUnit(quantity, isPercent);
  if (unit.empty()) return "calc(" + word + ")";
  return "calc(" + word + " * 1" + unit + ")";
}

std::string quantityText(const Quantity &quantity, SyntaxType type) {
  if (!isFinite(quantity)) return nonFiniteText(quantity);
  switch (quantity.dimension) {
    case Dimension::kPercent:
      return numberText(quantity.percent) + "%";
    case Dimension::kLengthPercent:
      return lengthPercentText(quantity);
    case Dimension::kNumber:
      if (type == SyntaxType::kInteger) return numberText(std::floor(quantity.amount + 0.5));
      if (type == SyntaxType::kNumber) return numberText(quantity.amount);
      return numberText(quantity.amount) + "px";
    default:
      return numberText(quantity.amount) + unitSuffix(quantity.dimension);
  }
}

// The alpha as the shortest decimal that rounds back to the same 8 bit channel
std::string alphaText(uint32_t alpha) {
  const double exact = alpha / kByteMax;
  const double hundredths = std::round(exact * 100) / 100;
  if (std::round(hundredths * kByteMax) == alpha) return numberText(hundredths);
  return numberText(std::round(exact * 1000) / 1000);
}

std::string colorText(long long color) {
  const uint32_t argb = static_cast<uint32_t>(color);
  const uint32_t alpha = (argb >> 24) & 0xFF;
  std::string channels = std::to_string((argb >> 16) & 0xFF) + ", " + std::to_string((argb >> 8) & 0xFF) +
      ", " + std::to_string(argb & 0xFF);
  if (alpha == 0xFF) return "rgb(" + channels + ")";
  return "rgba(" + channels + ", " + alphaText(alpha) + ")";
}

// A string token rewritten with double quotes, `\'` unescaped and a bare `"` escaped
std::string stringText(const std::string &text) {
  const char quote = text.front();
  std::string out = "\"";
  for (size_t at = 1; at < text.size() && text[at] != quote; ++at) {
    if (text[at] == '\\' && at + 1 < text.size()) {
      const char escaped = text[++at];
      if (escaped != '\'') out += '\\';
      out += escaped;
      continue;
    }
    if (text[at] == '"') out += '\\';
    out += text[at];
  }
  return out + '"';
}

// One argument of a transform function: computed when it is a number, a dimension or a `calc()`
std::string argumentText(const std::string &argument) {
  const std::optional<Quantity> quantity = quantityOf(trimmed(argument));
  return quantity.has_value() ? quantityText(*quantity, SyntaxType::kNumber) : std::string(trimmed(argument));
}

// Each function of a transform with its arguments computed and joined with a comma and a space
std::string transformText(const std::string &text) {
  std::string out;
  for (const std::string &function : splitValues(text, false)) {
    const size_t open = function.find('(');
    if (open == std::string::npos || function.back() != ')') return text;
    std::string arguments;
    for (const std::string &argument : splitValues(function.substr(open + 1, function.size() - open - 2), true)) {
      if (!arguments.empty()) arguments += ", ";
      arguments += argumentText(argument);
    }
    if (!out.empty()) out += ' ';
    out += function.substr(0, open + 1) + arguments + ')';
  }
  return out;
}

bool isNumericType(SyntaxType type) {
  switch (type) {
    case SyntaxType::kLength:
    case SyntaxType::kNumber:
    case SyntaxType::kPercentage:
    case SyntaxType::kLengthPercentage:
    case SyntaxType::kInteger:
    case SyntaxType::kAngle:
    case SyntaxType::kTime:
    case SyntaxType::kResolution:
      return true;
    default:
      return false;
  }
}

// One component value, as written when the engine has nothing to fold in it
std::string itemText(SyntaxType type, const std::string &text, const ColorParser &parseColor) {
  if (type == SyntaxType::kColor) {
    const std::optional<long long> color = parseColor(text);
    return color.has_value() ? colorText(*color) : text;
  }
  if (type == SyntaxType::kString) return stringText(text);
  if (type == SyntaxType::kTransformFunction || type == SyntaxType::kTransformList) {
    return transformText(text);
  }
  if (!isNumericType(type)) return text;
  const std::optional<Quantity> quantity = quantityOf(text);
  return quantity.has_value() ? quantityText(*quantity, type) : text;
}

std::string termText(const SyntaxTerm &term, const std::string &text, const ColorParser &parseColor) {
  if (term.multiplier == Multiplier::kNone) return itemText(term.type, text, parseColor);
  const bool isCommaList = term.multiplier == Multiplier::kCommas;
  std::string out;
  for (const std::string &part : splitValues(text, isCommaList)) {
    if (!out.empty()) out += isCommaList ? ", " : " ";
    out += itemText(term.type, std::string(trimmed(part)), parseColor);
  }
  return out;
}

const SyntaxTerm *firstMatching(const Syntax &syntax, const std::string &text, const ColorParser &parseColor) {
  for (const SyntaxTerm &term : syntax.terms) {
    const Syntax single{false, {term}};
    if (matchesSyntax(single, text, ValueContext::kDeclared, parseColor)) return &term;
  }
  return nullptr;
}

} // namespace

std::string computedText(const Syntax &syntax, std::string_view value, const ColorParser &parseColor) {
  if (syntax.isUniversal) return std::string(trimmed(value));
  const std::string uncommented = withoutComments(value);
  const std::string text(trimmed(uncommented));
  const SyntaxTerm *term = firstMatching(syntax, text, parseColor);
  return term == nullptr ? text : termText(*term, text, parseColor);
}

} // namespace symbiote
