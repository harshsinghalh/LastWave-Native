#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

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
        frames_ = candidate_ = events_ = 0;
        lastEvent_ = -static_cast<std::int64_t>(rate_ * 60.0);
        eventFrame_ = -1;
        fast_ = slow_ = bass_ = vocal_ = bassPower_ = vocalPower_ = 0.0F;
    }
    [[nodiscard]] std::int64_t eventCount() const noexcept { return events_; }
    // focus: 0 any strong energy rise, 1 bass-led, 2 vocal-range-led.
    // spacing: 0 at least 35 seconds, 1 at least 60 seconds between starts.
    Mix tick(float left, float right, int focus, int spacing) noexcept {
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

        if (eventFrame_ < 0) {
            const double gap = spacing == 1 ? 60.0 : 35.0;
            const float contrast = spacing == 1 ? 3.981072F : 2.818383F; // 6 / 4.5 dB
            const bool focusMatches = focus == 1 ? bassPower_ > fast_ * 0.35F
                : focus == 2 ? vocalPower_ > fast_ * 0.35F && bassPower_ < fast_ * 0.25F : true;
            const bool candidate = frames_ >= static_cast<std::int64_t>(rate_ * 10.0) &&
                frames_ - lastEvent_ >= static_cast<std::int64_t>(rate_ * gap) &&
                fast_ > 0.002512F && fast_ > std::max(slow_, 1.0e-9F) * contrast && focusMatches;
            candidate_ = candidate ? candidate_ + 1 : 0;
            // Reject isolated clicks/transients; require a sustained rise.
            if (candidate_ >= static_cast<std::int64_t>(rate_ * 0.18)) {
                eventFrame_ = 0;
                lastEvent_ = frames_;
                candidate_ = 0;
                ++events_;
            }
        }
        if (eventFrame_ < 0) return {};
        const double seconds = static_cast<double>(eventFrame_++) / rate_;
        // 30 ms entry avoids a click. The low-to-high rise completes at 1.5 s.
        if (seconds < 0.03) {
            const float f = smooth(static_cast<float>(seconds / 0.03));
            return {1.0F - 0.30F * f, 0.0F};
        }
        if (seconds < 1.5) {
            const float f = smooth(static_cast<float>((seconds - 0.03) / 1.47));
            return {0.70F + 0.10F * f, f};
        }
        if (seconds < 4.5) return {0.80F, 1.0F};
        if (seconds < 5.0) {
            const float f = smooth(static_cast<float>((seconds - 4.5) / 0.5));
            return {0.80F + 0.20F * f, 1.0F - f};
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
};
}
