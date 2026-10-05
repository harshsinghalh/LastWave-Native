#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <array>

namespace lastwave::audio {

// Content-based selection, not a popularity score or a vocal stem separator.
// The audio thread owns this state. No allocation, locks, network or inference.
class DjHighlightDetector final {
public:
    struct Mix { float volume{1.0F}; float boost{0.0F}; };
    void configure(double rate) noexcept {
        rate_ = std::isfinite(rate) && rate >= 8000.0 ? rate : 48000.0;
        fastAlpha_ = static_cast<float>(1.0 - std::exp(-1.0 / (rate_ * 0.04)));
        slowAlpha_ = static_cast<float>(1.0 - std::exp(-1.0 / (rate_ * 3.0)));
        bassAlpha_ = static_cast<float>(1.0 - std::exp(-2.0 * 3.141592653589793 * 180.0 / rate_));
        vocalAlpha_ = static_cast<float>(1.0 - std::exp(-2.0 * 3.141592653589793 * 4000.0 / rate_));
        reset();
    }
    void reset() noexcept {
        generation_ = generation_ % 16'000'000 + 1; // exactly representable in JNI's float snapshot
        candidateId_ = 0;
        pendingFrame_ = -1;
        frames_ = candidate_ = events_ = 0;
        lastEvent_ = -static_cast<std::int64_t>(rate_ * 60.0);
        eventFrame_ = -1;
        fast_ = slow_ = bass_ = vocal_ = bassPower_ = vocalPower_ = 0.0F;
        plateauUsed_ = false;
        quietFrames_ = 0;
    }
    [[nodiscard]] std::int64_t eventCount() const noexcept { return events_; }
    [[nodiscard]] int generation() const noexcept { return generation_; }
    [[nodiscard]] int candidateId() const noexcept { return candidateId_; }
    [[nodiscard]] std::array<float, 8> features() const noexcept {
        const auto p = pendingFrame_ >= 0 ? pendingFeatures_ : std::array<float, 4>{fast_, slow_,
            bassPower_ / std::max(fast_, 1.0e-9F), vocalPower_ / std::max(fast_, 1.0e-9F)};
        return {p[0], p[1], p[2], p[3], static_cast<float>(generation_),
            static_cast<float>(candidateId_), pendingFrame_ >= 0 ? 1.0F : 0.0F,
            static_cast<float>(static_cast<double>(frames_) / rate_)};
    }
    // focus: 0 any strong energy rise, 1 bass-led, 2 vocal-range-led.
    // spacing: 0 at least 35 seconds, 1 at least 60 seconds between starts.
    Mix tick(float left, float right, int focus, int spacing, bool requireModel = false, bool approved = false,
        float before = 0.70F, float after = 0.80F, float rampSeconds = 1.5F) noexcept {
        if (!std::isfinite(left)) left = 0.0F;
        if (!std::isfinite(right)) right = 0.0F;
        ++frames_;
        const float power = 0.5F * (left * left + right * right);
        const float mid = 0.5F * (left + right);
        bass_ += bassAlpha_ * (mid - bass_);
        vocal_ += vocalAlpha_ * (mid - vocal_);
        const float voice = vocal_ - bass_;
        fast_ += fastAlpha_ * (power - fast_);
        slow_ += slowAlpha_ * (power - slow_);
        bassPower_ += fastAlpha_ * (bass_ * bass_ - bassPower_);
        vocalPower_ += fastAlpha_ * (voice * voice - vocalPower_);
        quietFrames_ = fast_ < 0.002512F ? quietFrames_ + 1 : 0;
        if (quietFrames_ > static_cast<std::int64_t>(rate_)) plateauUsed_ = false;

        if (eventFrame_ < 0) {
            if (pendingFrame_ >= 0) {
                // Wait for background inference without stalling PCM. Only a
                // still-energetic section and the matching decision may start.
                ++pendingFrame_;
                if (pendingFrame_ > static_cast<std::int64_t>(rate_ * 15.0) || fast_ < pendingFeatures_[0] * 0.65F) {
                    pendingFrame_ = -1;
                    candidate_ = 0;
                } else if (!requireModel || approved) {
                    eventFrame_ = 0;
                    lastEvent_ = frames_;
                    pendingFrame_ = -1;
                    ++events_;
                    plateauUsed_ = true;
                }
            }
            const double gap = spacing == 1 ? 60.0 : 35.0;
            const float contrast = spacing == 1 ? 3.981072F : 2.818383F; // 6 / 4.5 dB
            const bool focusMatches = focus == 1 ? bassPower_ > fast_ * 0.35F
                : focus == 2 ? vocalPower_ > fast_ * 0.35F && bassPower_ < fast_ * 0.25F : true;
            const bool rise = fast_ > std::max(slow_, 1.0e-9F) * contrast;
            // Mastered choruses can stay energetic without a 4.5 dB jump.
            // Permit one sustained loud section per plateau, with the same
            // focus, spacing and real model gate. Never pulse a steady section.
            const bool plateau = !plateauUsed_ && fast_ > 0.02F && fast_ >= slow_ * 0.85F;
            const bool candidate = eventFrame_ < 0 && pendingFrame_ < 0 && frames_ >= static_cast<std::int64_t>(rate_ * 10.0) &&
                frames_ - lastEvent_ >= static_cast<std::int64_t>(rate_ * gap) &&
                fast_ > 0.002512F && (rise || plateau) && focusMatches;
            candidate_ = candidate ? candidate_ + 1 : 0;
            // Reject isolated clicks/transients; require a sustained rise.
            if (candidate_ >= static_cast<std::int64_t>(rate_ * (rise ? 0.18 : 1.2))) {
                ++candidateId_;
                plateauUsed_ = true;
                pendingFrame_ = 0;
                pendingFeatures_ = {fast_, slow_, bassPower_ / std::max(fast_, 1.0e-9F),
                    vocalPower_ / std::max(fast_, 1.0e-9F)};
                candidate_ = 0;
                if (!requireModel) {
                    eventFrame_ = 0;
                    lastEvent_ = frames_;
                    pendingFrame_ = -1;
                    ++events_;
                    plateauUsed_ = true;
                }
            }
        }
        if (eventFrame_ < 0) return {};
        const double seconds = static_cast<double>(eventFrame_++) / rate_;
        // A de-click entry followed by the saved low-to-high transition.
        if (seconds < 0.03) {
            const float f = smooth(static_cast<float>(seconds / 0.03));
            return {1.0F + (before - 1.0F) * f, 0.0F};
        }
        if (seconds < rampSeconds) {
            const float f = smooth(static_cast<float>((seconds - 0.03) / (rampSeconds - 0.03)));
            return {before + (after - before) * f, f};
        }
        if (seconds < rampSeconds + 3.0) return {after, 1.0F};
        if (seconds < rampSeconds + 3.5) {
            const float f = smooth(static_cast<float>((seconds - rampSeconds - 3.0) / 0.5));
            return {after + (1.0F - after) * f, 1.0F - f};
        }
        eventFrame_ = -1;
        return {};
    }
private:
    static float smooth(float f) noexcept { return f * f * (3.0F - 2.0F * f); }
    double rate_{48000.0};
    float fastAlpha_{}, slowAlpha_{}, bassAlpha_{}, vocalAlpha_{};
    float fast_{}, slow_{}, bass_{}, vocal_{}, bassPower_{}, vocalPower_{};
    std::int64_t frames_{}, candidate_{}, events_{}, lastEvent_{};
    std::int64_t eventFrame_{-1};
    int generation_{0}, candidateId_{0};
    std::int64_t pendingFrame_{-1};
    std::array<float, 4> pendingFeatures_{};
    bool plateauUsed_{false};
    std::int64_t quietFrames_{0};
};
}
