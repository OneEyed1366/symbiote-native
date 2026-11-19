#include "SymbioteTransform.h"

#include <cctype>
#include <cstdlib>
#include <optional>
#include <vector>

#include "SymbioteStyleText.h"

namespace symbiote {

namespace {

constexpr const char *kEmptyList = "[]";
constexpr const char *kPercentUnit = "%";

struct TransformStep {
  std::string name;
  std::string args;
};

// A number with its unit as RN's argument pattern reads it: `10px`, `-2.5%`, `0`
struct UnitNumber {
  double value;
  std::string unit;
  size_t end;
};

bool isWordChar(char at) {
  return std::isalnum(static_cast<unsigned char>(at)) != 0 || at == '_';
}

bool isDigit(char at) {
  return std::isdigit(static_cast<unsigned char>(at)) != 0;
}

// `(\w+)\(([^)]+)\)` over the text, every match in order
std::vector<TransformStep> transformSteps(std::string_view text) {
  std::vector<TransformStep> steps;
  size_t at = 0;
  while (at < text.size()) {
    size_t nameEnd = at;
    while (nameEnd < text.size() && isWordChar(text[nameEnd])) ++nameEnd;
    const size_t close = nameEnd < text.size() && text[nameEnd] == '(' ? text.find(')', nameEnd) : std::string_view::npos;
    if (nameEnd == at || close == std::string_view::npos || close == nameEnd + 1) {
      ++at;
      continue;
    }
    steps.push_back({std::string(text.substr(at, nameEnd - at)),
                     std::string(text.substr(nameEnd + 1, close - nameEnd - 1))});
    at = close + 1;
  }
  return steps;
}

// `[+-]?\d+(\.\d+)?` at `from`, or nothing
std::optional<size_t> numberEnd(std::string_view text, size_t from) {
  size_t at = from;
  if (at < text.size() && (text[at] == '+' || text[at] == '-')) ++at;
  const size_t digitsFrom = at;
  while (at < text.size() && isDigit(text[at])) ++at;
  if (at == digitsFrom) return std::nullopt;
  if (at + 1 < text.size() && text[at] == '.' && isDigit(text[at + 1])) {
    at += 2;
    while (at < text.size() && isDigit(text[at])) ++at;
  }
  return at;
}

// The first number at or after `from`, with the letters or `%` that follow it
std::optional<UnitNumber> nextUnitNumber(std::string_view text, size_t from) {
  for (size_t at = from; at < text.size(); ++at) {
    const std::optional<size_t> end = numberEnd(text, at);
    if (!end.has_value()) continue;
    size_t unitEnd = *end;
    const bool isPercent = unitEnd < text.size() && text[unitEnd] == '%';
    if (isPercent) ++unitEnd;
    while (!isPercent && unitEnd < text.size() && std::isalpha(static_cast<unsigned char>(text[unitEnd])) != 0) ++unitEnd;
    const double value = std::strtod(std::string(text.substr(at, *end - at)).c_str(), nullptr);
    return UnitNumber{value, std::string(text.substr(*end, unitEnd - *end)), unitEnd};
  }
  return std::nullopt;
}

std::optional<std::string> matrixValue(const std::string &args) {
  std::vector<std::string> values;
  for (size_t at = 0; at < args.size();) {
    const std::optional<size_t> end = numberEnd(args, at);
    if (!end.has_value()) {
      ++at;
      continue;
    }
    values.push_back(jsonNumber(std::strtod(args.substr(at, *end - at).c_str(), nullptr)));
    at = *end;
  }
  const bool isValid = values.size() == 9 || values.size() == 16;
  if (!isValid) return std::nullopt;
  return jsonArray(values);
}

// `translate` and `translate3d`: a percentage stays text, any other unit is dropped
std::optional<std::string> translateValue(const std::string &name, const std::string &args) {
  std::vector<std::string> values;
  for (size_t at = 0; at < args.size();) {
    const std::optional<UnitNumber> next = nextUnitNumber(args, at);
    if (!next.has_value()) break;
    if (next->value != 0 && next->unit.empty()) return std::nullopt;
    const bool isPercent = next->unit == kPercentUnit;
    values.push_back(isPercent ? jsonText(jsonNumber(next->value) + kPercentUnit) : jsonNumber(next->value));
    at = next->end;
  }
  const bool isValid = name == "translate" ? values.size() == 1 || values.size() == 2 : values.size() == 3;
  if (!isValid) return std::nullopt;
  if (values.size() == 1) values.push_back("0");
  return jsonArray(values);
}

// `translateX`, `translateY` and `perspective` take the first number, whatever its unit
// `nullopt` with `isSkipped` set is a step RN leaves out, without making the transform invalid
struct SingleResult {
  std::optional<std::string> json;
  bool isSkipped;
};

SingleResult singleValue(const std::string &name, const std::string &args) {
  const std::optional<UnitNumber> first = nextUnitNumber(args, 0);
  if (!first.has_value()) return {std::nullopt, true};
  if (first->value != 0 && first->unit.empty()) return {std::nullopt, false};
  if (name == "perspective" && first->value == 0) return {std::nullopt, false};
  return {jsonNumber(first->value), false};
}

// What JS `Number(text)` accepts for a plain decimal, after trimming
std::optional<double> plainNumber(std::string_view text) {
  const std::string_view body = trimmed(text);
  if (body.empty()) return 0;
  const NumberPrefix split = numberPrefix(body);
  if (!split.rest.empty() || split.digits.empty()) return std::nullopt;
  return numberOfPrefix(split.digits);
}

bool isAngleName(const std::string &name) {
  return name == "rotate" || name == "rotateX" || name == "rotateY" || name == "rotateZ" ||
      name == "skewX" || name == "skewY";
}

bool isScaleName(const std::string &name) {
  return name == "scale" || name == "scaleX" || name == "scaleY";
}

bool holdsAngleUnit(const std::string &args) {
  return args.find("deg") != std::string::npos || args.find("rad") != std::string::npos;
}

// The remaining names keep the argument as it is, a number when it reads as one
std::optional<std::string> plainValue(const std::string &name, const std::string &args) {
  const std::optional<double> number = plainNumber(args);
  if (isScaleName(name)) return number.has_value() ? std::optional<std::string>(jsonNumber(*number)) : std::nullopt;
  if (!isAngleName(name) || number.has_value() || !holdsAngleUnit(args)) return std::nullopt;
  return jsonText(args);
}

enum class StepOutcome { kKept, kSkipped, kInvalid };

StepOutcome stepJson(const TransformStep &step, std::string &json) {
  std::optional<std::string> value;
  std::string key = step.name;
  if (step.name == "matrix") {
    value = matrixValue(step.args);
  } else if (step.name == "translate" || step.name == "translate3d") {
    key = "translate";
    value = translateValue(step.name, step.args);
  } else if (step.name == "translateX" || step.name == "translateY" || step.name == "perspective") {
    const SingleResult single = singleValue(step.name, step.args);
    if (single.isSkipped) return StepOutcome::kSkipped;
    value = single.json;
  } else {
    value = plainValue(step.name, step.args);
  }
  if (!value.has_value()) return StepOutcome::kInvalid;
  json = jsonObject({{key, *value}});
  return StepOutcome::kKept;
}

} // namespace

std::string transformJson(std::string_view text) {
  std::vector<std::string> entries;
  for (const TransformStep &step : transformSteps(text)) {
    std::string json;
    const StepOutcome outcome = stepJson(step, json);
    if (outcome == StepOutcome::kInvalid) return kEmptyList;
    if (outcome == StepOutcome::kKept) entries.push_back(json);
  }
  return jsonArray(entries);
}

} // namespace symbiote
