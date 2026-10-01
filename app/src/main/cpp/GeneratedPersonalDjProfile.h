#pragma once

// Checked-in fallback. CI may regenerate this from the user's preference via Laya.
namespace lastwave::audio::personal_dj {
inline constexpr float kMinimumDb = -2.000F;
inline constexpr float kMaximumDb = 5.000F;
inline constexpr float kPreDropDb = -2.000F;
inline constexpr float kImpactDb = 5.000F;
inline constexpr double kLookAheadSeconds = 0.080000;
inline constexpr double kImpactHoldSeconds = 0.070000;
inline constexpr double kCooldownSeconds = 0.420000;
inline constexpr float kStrongSurgeDb = 4.500F;
inline constexpr float kLoudSurgeDb = 2.500F;
inline constexpr double kPreDuckSeconds = 0.022000;
inline constexpr double kImpactAttackSeconds = 0.006000;
inline constexpr double kImpactReleaseSeconds = 0.180000;
}  // namespace lastwave::audio::personal_dj
