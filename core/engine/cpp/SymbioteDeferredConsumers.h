#pragma once

#include <cstdint>
#include <memory>
#include <unordered_map>
#include <utility>
#include <vector>

namespace symbiote {

// Consumers a surface's last commit hook pass left for a later commit, kept per surface
template <class TNode>
class DeferredConsumers {
 public:
  // The latest hook pass decides what a surface still owes, an empty list clears it
  void replace(int32_t surfaceId, std::vector<std::weak_ptr<TNode>> nodes) {
    if (nodes.empty()) {
      bySurface_.erase(surfaceId);
      return;
    }
    bySurface_[surfaceId] = std::move(nodes);
  }

  // Only the surface's own consumers count, a live one that still waits
  template <class TStillWaiting>
  bool hasAny(int32_t surfaceId, TStillWaiting stillWaiting) const {
    const auto found = bySurface_.find(surfaceId);
    if (found == bySurface_.end()) return false;
    for (const std::weak_ptr<TNode> &entry : found->second) {
      const std::shared_ptr<TNode> node = entry.lock();
      if (node != nullptr && stillWaiting(*node)) return true;
    }
    return false;
  }

 private:
  std::unordered_map<int32_t, std::vector<std::weak_ptr<TNode>>> bySurface_;
};

} // namespace symbiote
