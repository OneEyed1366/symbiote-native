#include "SymbioteMath.h"

#include <cctype>
#include <cmath>
#include <cstdlib>
#include <string>
#include <unordered_map>

#include "SymbioteCalc.h"
#include "SymbioteMathOps.h"

namespace symbiote {

namespace {

// The spec asks for 32 nested pairs of parentheses inside the `calc(`, which opens a level itself
constexpr size_t kMaxDepth = 34;
constexpr double kPi = 3.14159265358979323846;
constexpr double kPixelsPerInch = 96;
constexpr double kCentimetersPerInch = 2.54;
constexpr double kPointsPerInch = 72;
constexpr double kPixelsPerPica = 16;
constexpr double kDegreesPerGradian = 0.9;
constexpr double kDegreesPerTurn = 360;
constexpr double kSecondsPerMillisecond = 0.001;

bool isSpace(char at) {
  return std::isspace(static_cast<unsigned char>(at)) != 0;
}

bool isDigit(char at) {
  return std::isdigit(static_cast<unsigned char>(at)) != 0;
}

bool isLetter(char at) {
  return std::isalpha(static_cast<unsigned char>(at)) != 0;
}

std::string lowered(std::string_view text) {
  std::string out(text);
  for (char &at : out) at = static_cast<char>(std::tolower(static_cast<unsigned char>(at)));
  return out;
}

using UnitTable = std::unordered_map<std::string, MathUnit>;

void addUnits(UnitTable &table, std::initializer_list<const char *> names, const MathUnit &unit) {
  for (const char *name : names) table[name] = unit;
}

UnitTable lengthUnits() {
  UnitTable table;
  const double pixel = 1;
  addUnits(table, {"px"}, {Dimension::kLength, pixel, false, false});
  addUnits(table, {"in"}, {Dimension::kLength, kPixelsPerInch, false, false});
  addUnits(table, {"cm"}, {Dimension::kLength, kPixelsPerInch / kCentimetersPerInch, false, false});
  addUnits(table, {"mm"}, {Dimension::kLength, kPixelsPerInch / (kCentimetersPerInch * 10), false, false});
  addUnits(table, {"q"}, {Dimension::kLength, kPixelsPerInch / (kCentimetersPerInch * 40), false, false});
  addUnits(table, {"pt"}, {Dimension::kLength, kPixelsPerInch / kPointsPerInch, false, false});
  addUnits(table, {"pc"}, {Dimension::kLength, kPixelsPerPica, false, false});
  addUnits(table, {"em", "rem"}, {Dimension::kLength, kRemInPixels, true, false});
  addUnits(table, {"ex", "rex", "ch", "rch", "cap", "rcap", "ic", "ric", "lh", "rlh"},
      {Dimension::kLength, pixel, true, true});
  addUnits(table, {"cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax"}, {Dimension::kLength, pixel, true, true});
  addUnits(table, {"vw", "vh", "vmin", "vmax", "vi", "vb", "svw", "svh", "lvw", "lvh", "dvw", "dvh"},
      {Dimension::kLength, pixel, false, true});
  addUnits(table, {"svmin", "svmax", "lvmin", "lvmax", "dvmin", "dvmax"},
      {Dimension::kLength, pixel, false, true});
  return table;
}

UnitTable otherUnits() {
  UnitTable table;
  addUnits(table, {"deg"}, {Dimension::kAngle, 1, false, false});
  addUnits(table, {"grad"}, {Dimension::kAngle, kDegreesPerGradian, false, false});
  addUnits(table, {"rad"}, {Dimension::kAngle, kDegreesPerTurn / (2 * kPi), false, false});
  addUnits(table, {"turn"}, {Dimension::kAngle, kDegreesPerTurn, false, false});
  addUnits(table, {"s"}, {Dimension::kTime, 1, false, false});
  addUnits(table, {"ms"}, {Dimension::kTime, kSecondsPerMillisecond, false, false});
  addUnits(table, {"dppx", "x"}, {Dimension::kResolution, 1, false, false});
  addUnits(table, {"dpi"}, {Dimension::kResolution, 1 / kPixelsPerInch, false, false});
  addUnits(table, {"dpcm"}, {Dimension::kResolution, kCentimetersPerInch / kPixelsPerInch, false, false});
  return table;
}

const UnitTable &unitTable() {
  static const UnitTable table = [] {
    UnitTable merged = lengthUnits();
    merged.merge(otherUnits());
    return merged;
  }();
  return table;
}

MathType typeOfDimension(Dimension dimension) {
  MathType type;
  switch (dimension) {
    case Dimension::kLength:
      type.length = 1;
      break;
    case Dimension::kAngle:
      type.angle = 1;
      break;
    case Dimension::kTime:
      type.time = 1;
      break;
    case Dimension::kResolution:
      type.resolution = 1;
      break;
    default:
      break;
  }
  return type;
}

// Recursive descent over the grammar of CSS Values 4, section 10, with the math functions
class MathParser {
 public:
  explicit MathParser(std::string_view text) : text_(text) {}

  std::optional<MathValue> parseWhole() {
    skipSpace();
    const std::optional<MathValue> value = startsWithMathCall(text_.substr(at_)) ? parseCall(1) : parseLiteral();
    skipSpace();
    if (!value.has_value() || at_ != text_.size()) return std::nullopt;
    return value;
  }

 private:
  std::optional<MathValue> parseSum(size_t depth) {
    std::optional<MathValue> left = parseProduct(depth);
    while (left.has_value()) {
      const size_t before = at_;
      skipSpace();
      const bool isSpaced = at_ > before;
      if (at_ >= text_.size() || (text_[at_] != '+' && text_[at_] != '-')) {
        at_ = before;
        return left;
      }
      const char op = text_[at_++];
      const bool hasSpaceAfter = at_ < text_.size() && isSpace(text_[at_]);
      if (!isSpaced || !hasSpaceAfter) return std::nullopt;
      const std::optional<MathValue> right = parseProduct(depth);
      left = right.has_value() ? sumValues(*left, *right, op == '-') : std::nullopt;
    }
    return std::nullopt;
  }

  std::optional<MathValue> parseProduct(size_t depth) {
    std::optional<MathValue> left = parseValue(depth);
    while (left.has_value()) {
      const size_t before = at_;
      skipSpace();
      if (at_ >= text_.size() || (text_[at_] != '*' && text_[at_] != '/')) {
        at_ = before;
        return left;
      }
      const char op = text_[at_++];
      const std::optional<MathValue> right = parseValue(depth);
      if (!right.has_value()) return std::nullopt;
      left = op == '*' ? multiplyValues(*left, *right) : divideValues(*left, *right);
    }
    return std::nullopt;
  }

  std::optional<MathValue> parseValue(size_t depth) {
    skipSpace();
    if (depth > kMaxDepth || at_ >= text_.size()) return std::nullopt;
    if (text_[at_] == '(') {
      ++at_;
      return parseGroup(depth + 1);
    }
    if (isLetter(text_[at_])) return parseWord(depth);
    const bool isSigned = text_[at_] == '-' || text_[at_] == '+';
    if (isSigned && at_ + 1 < text_.size() && isLetter(text_[at_ + 1])) return parseSignedConstant();
    return parseLiteral();
  }

  std::optional<MathValue> parseGroup(size_t depth) {
    const std::optional<MathValue> inner = parseSum(depth);
    if (!inner.has_value() || !take(')')) return std::nullopt;
    return inner;
  }

  // A call of a function, or one of the constants `e` and `pi`
  std::optional<MathValue> parseWord(size_t depth) {
    const size_t start = at_;
    const std::string word = takeIdentifier();
    if (at_ < text_.size() && text_[at_] == '(') {
      at_ = start;
      return parseCall(depth + 1);
    }
    return constantNamed(word, 1);
  }

  // `-infinity` is one token, so a sign may lead a constant and nothing else
  std::optional<MathValue> parseSignedConstant() {
    const double sign = text_[at_] == '-' ? -1 : 1;
    ++at_;
    const std::string word = takeIdentifier();
    if (at_ < text_.size() && text_[at_] == '(') return std::nullopt;
    return constantNamed(word, sign);
  }

  static std::optional<MathValue> constantNamed(const std::string &word, double sign) {
    const std::unordered_map<std::string, double> constants = {
        {"e", std::exp(1.0)}, {"pi", kPi}, {"infinity", HUGE_VAL}, {"nan", std::nan("")}};
    const auto found = constants.find(word);
    if (found == constants.end()) return std::nullopt;
    MathValue value;
    value.amount = sign * found->second;
    return value;
  }

  std::optional<MathValue> parseCall(size_t depth) {
    const std::string name = takeIdentifier();
    if (!take('(')) return std::nullopt;
    if (name == "calc") return parseGroup(depth);
    if (!isMathFunction(name)) return std::nullopt;
    return parseArguments(name, depth);
  }

  std::optional<MathValue> parseArguments(const std::string &name, size_t depth) {
    MathCall call;
    if (name == "round") takeStrategy(call.strategy);
    while (true) {
      if (name == "clamp" && takeNone()) {
        call.args.emplace_back(std::nullopt);
      } else {
        const std::optional<MathValue> argument = parseSum(depth);
        if (!argument.has_value()) return std::nullopt;
        call.args.push_back(*argument);
      }
      if (take(',')) continue;
      if (!take(')')) return std::nullopt;
      return callMathFunction(name, call);
    }
  }

  // `up`, `down`, `to-zero` or `nearest` leading `round()`, kept only when a comma follows
  void takeStrategy(RoundStrategy &strategy) {
    const size_t start = at_;
    skipSpace();
    const std::string word = peekWord();
    const std::unordered_map<std::string, RoundStrategy> strategies = {
        {"nearest", RoundStrategy::kNearest}, {"up", RoundStrategy::kUp},
        {"down", RoundStrategy::kDown}, {"to-zero", RoundStrategy::kToZero}};
    const auto found = strategies.find(word);
    at_ += word.size();
    if (found == strategies.end() || !take(',')) {
      at_ = start;
      return;
    }
    strategy = found->second;
  }

  bool takeNone() {
    const size_t start = at_;
    skipSpace();
    const std::string word = peekWord();
    at_ += word.size();
    if (word == "none") return true;
    at_ = start;
    return false;
  }

  std::string peekWord() const {
    size_t end = at_;
    while (end < text_.size() && (isLetter(text_[end]) || text_[end] == '-')) ++end;
    return lowered(text_.substr(at_, end - at_));
  }

  std::string takeWord() {
    size_t end = at_;
    while (end < text_.size() && isLetter(text_[end])) ++end;
    const std::string word = lowered(text_.substr(at_, end - at_));
    at_ = end;
    return word;
  }

  // A function name, which may hold digits after its first letter, as `atan2` does
  std::string takeIdentifier() {
    size_t end = at_;
    while (end < text_.size() && (isLetter(text_[end]) || (end > at_ && isDigit(text_[end])))) ++end;
    const std::string word = lowered(text_.substr(at_, end - at_));
    at_ = end;
    return word;
  }

  std::optional<MathValue> parseLiteral() {
    const std::optional<double> number = takeNumber();
    if (!number.has_value()) return std::nullopt;
    MathValue value;
    if (at_ < text_.size() && text_[at_] == '%') {
      ++at_;
      value.type.hasPercent = true;
      value.percent = *number;
      return value;
    }
    const std::string unit = takeWord();
    if (unit.empty()) {
      value.amount = *number;
      return value;
    }
    const std::optional<MathUnit> known = mathUnit(unit);
    if (!known.has_value()) return std::nullopt;
    value.type = typeOfDimension(known->dimension);
    value.amount = known->isOpaque ? 0 : *number * known->scale;
    value.isOpaque = known->isOpaque;
    value.isRelative = known->isRelative;
    return value;
  }

  // `[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?`, the exponent only when a digit follows it
  std::optional<double> takeNumber() {
    const size_t start = at_;
    if (at_ < text_.size() && (text_[at_] == '+' || text_[at_] == '-')) ++at_;
    const size_t digitsAt = at_;
    while (at_ < text_.size() && (isDigit(text_[at_]) || text_[at_] == '.')) ++at_;
    if (at_ == digitsAt) return std::nullopt;
    takeExponent();
    char *end = nullptr;
    const std::string digits(text_.substr(start, at_ - start));
    const double value = std::strtod(digits.c_str(), &end);
    if (*end != '\0') return std::nullopt;
    return value;
  }

  void takeExponent() {
    if (at_ >= text_.size() || (text_[at_] != 'e' && text_[at_] != 'E')) return;
    size_t cursor = at_ + 1;
    if (cursor < text_.size() && (text_[cursor] == '+' || text_[cursor] == '-')) ++cursor;
    if (cursor >= text_.size() || !isDigit(text_[cursor])) return;
    while (cursor < text_.size() && isDigit(text_[cursor])) ++cursor;
    at_ = cursor;
  }

  bool take(char expected) {
    skipSpace();
    if (at_ >= text_.size() || text_[at_] != expected) return false;
    ++at_;
    return true;
  }

  void skipSpace() {
    while (at_ < text_.size() && isSpace(text_[at_])) ++at_;
  }

  std::string_view text_;
  size_t at_ = 0;
};

} // namespace

std::optional<MathUnit> mathUnit(std::string_view unit) {
  const auto found = unitTable().find(lowered(unit));
  if (found == unitTable().end()) return std::nullopt;
  return found->second;
}

bool startsWithMathCall(std::string_view text) {
  size_t at = 0;
  while (at < text.size() && isSpace(text[at])) ++at;
  const size_t start = at;
  while (at < text.size() && (isLetter(text[at]) || (at > start && isDigit(text[at])))) ++at;
  if (at == start || at >= text.size() || text[at] != '(') return false;
  const std::string name = lowered(text.substr(start, at - start));
  return name == "calc" || isMathFunction(name);
}

std::optional<MathValue> parseMath(std::string_view text) {
  return MathParser(text).parseWhole();
}

std::optional<Dimension> mathDimension(const MathType &type) {
  const int total = type.length + type.angle + type.time + type.resolution;
  const bool isUnit = type.length >= 0 && type.angle >= 0 && type.time >= 0 && type.resolution >= 0;
  if (total == 0 && isUnit) return type.hasPercent ? Dimension::kPercent : Dimension::kNumber;
  if (total != 1 || !isUnit) return std::nullopt;
  if (type.length == 1) return type.hasPercent ? Dimension::kLengthPercent : Dimension::kLength;
  if (type.hasPercent) return std::nullopt;
  if (type.angle == 1) return Dimension::kAngle;
  return type.time == 1 ? Dimension::kTime : Dimension::kResolution;
}

} // namespace symbiote
