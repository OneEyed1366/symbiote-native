#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>

namespace symbiote {

// The custom properties written on one surface, read after the node chain and before `:root`
// Keyed by surface id, which Fabric never reuses within a process
class SurfaceVariables {
 public:
  static SurfaceVariables &instance();

  void set(int32_t surface, std::string name, std::string value);
  void erase(int32_t surface, std::string_view name);
  std::optional<std::string> get(int32_t surface, std::string_view name) const;
  void clear();

 private:
  mutable std::mutex mutex_;
  std::unordered_map<int32_t, std::unordered_map<std::string, std::string>> bySurface_;
};

} // namespace symbiote
