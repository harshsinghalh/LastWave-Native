#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <memory>
#include "DjHighlightDetector.h"

namespace lastwave::audio {

class DspProcessor final {
public:
    static constexpr std::size_t kEqualizerBandCount = 15;

    DspProcessor() noexcept;
    ~DspProcessor();

    void configure(double sampleRate) noexcept;
    void reset() noexcept;
    // Independent automation layer; never modifies saved EQ or clarity settings.
    void setDjCue(float volume, float energyDb, float vocalsDb, float beatsDb) noexcept;
    void setDjHighlights(bool enabled, int focus, int spacing, float energyDb, float vocalsDb, float beatsDb,
        float before = 0.70F, float after = 0.80F, float rampSeconds = 1.5F) noexcept;
    void setDjLayaMode(bool enabled) noexcept { layaEnabled_.store(enabled); }
    void setDjLayaDecision(int generation, int candidate, bool accepted) noexcept;
    [[nodiscard]] std::array<float, 8> djFeatures() const noexcept;
    void setDjTimedMode(bool enabled, double cueSeconds) noexcept;
    void setDjMediaTimeUs(std::int64_t positionUs) noexcept;
    void previewDjEnergy(float before, float after, float rampSeconds,
        float energy, float vocals, float beats) noexcept;
    [[nodiscard]] std::array<float, 9> djRuntime() const noexcept;
    void setStudioMasterClarity(bool enabled) noexcept;
    void setBitPerfect(bool enabled) noexcept;
    void setPeakProtectionEnabled(bool enabled) noexcept;
    void setEqualizer(
        bool enabled,
        const float* gainsDb,
        std::size_t gainCount) noexcept;
    // Studio Master Clarity parameterization. All setters are lock-free
    // control-thread calls; the audio thread only performs atomic loads, so
    // process() stays allocation- and lock-free. Neutral defaults (wet 1.0,
    // all trims 0 dB, no Atmos bypass) reproduce the shipping curve
    // sample-exactly.
    static constexpr std::size_t kClarityTrimCount = 8;
    static constexpr int kClarityPresetReference = 0;
    static constexpr int kClarityPresetSpeaker = 1;
    static constexpr int kClarityPresetHeadphone = 2;
    static constexpr int kClarityPresetDac = 3;
    // Per-stage trim order: 0 sub-bass high-pass, 1 bass foundation,
    // 2 low-mid separation, 3 boxiness control, 4 presence detail,
    // 5 air shelf, 6 mono-bass high-pass, 7 exciter high-pass.
    // Peaking/shelf trims offset the stage design gain; high-pass trims
    // apply a linear post gain. Values are clamped to +-12 dB.
    void setClarityWet(float wet) noexcept;
    void setClarityTrims(const float* trimsDb, std::size_t trimCount) noexcept;
    void setClarityPreset(int preset) noexcept;
    // Atmos-aware bypass: while set, the clarity chain fully bypasses
    // independent of the on/off toggle. The toggle state itself is kept,
    // so clearing the flag restores the previous mix without clicks.
    void setClarityAtmosBypass(bool bypass) noexcept;
    void setDjEnergyEnabled(bool enabled) noexcept;
    // App playback uses DJ Energy as the master for timed/signal/Laya modes.
    void setDjEnergyProgramManaged(bool enabled) noexcept { energyProgramManaged_.store(enabled); }
    // The media-decoder path enables a true three-second delay so the DSP can
    // react to an incoming high-energy hit while outputting audio from three
    // seconds earlier. The direct Oboe path leaves this false to avoid
    // double-processing already-processed Media3 PCM.
    void setLongLookAheadMode(bool enabled) noexcept;
    // Drains the delayed tail after end-of-stream. Returns frames written.
    std::size_t flushLookAhead(
        float* interleaved,
        std::size_t frameCapacity,
        std::int32_t channelCount) noexcept;
    // Process-wide broadcast helpers for the JNI layer, which owns the
    // engine handle but not the individual DSP instances. Each call
    // forwards to every live instance (playback and media paths). Control
    // thread only; process() itself takes no locks.
    static void broadcastClarityWet(float wet);
    static void broadcastClarityTrims(const float* trimsDb, std::size_t trimCount);
    static void broadcastClarityPreset(int preset);
    static void broadcastClarityAtmosBypass(bool bypass);
    static void broadcastDjEnergyEnabled(bool enabled);
    void process(
        float* interleaved,
        std::int32_t frameCount,
        std::int32_t channelCount = 2) noexcept;

    [[nodiscard]] bool isStudioMasterClarityEnabled() const noexcept {
        return targetEnabled_.load(std::memory_order_acquire);
    }

    [[nodiscard]] bool isBitPerfectEnabled() const noexcept {
        return bitPerfectEnabled_.load(std::memory_order_acquire);
    }

private:
    std::atomic<bool> highlightEnabled_{false};
    std::atomic<int> highlightFocus_{0}, highlightSpacing_{0};
    std::atomic<float> highlightEnergy_{2.0F}, highlightVocals_{2.0F}, highlightBeats_{3.0F};
    DjHighlightDetector highlights_;
    bool highlightWasEnabled_{false};
    int highlightWasFocus_{-1}, highlightWasSpacing_{-1};
    std::atomic<bool> layaEnabled_{false}, layaAccepted_{false};
    std::atomic<int> layaGeneration_{-1}, layaCandidate_{-1};
    std::array<std::atomic<float>, 8> featureSnapshot_{};
    bool layaWasEnabled_{false};
    int featureCountdown_{0};
    std::atomic<float> djVolumeTarget_{1.0F}, djEnergyTarget_{0.0F}, djVocalsTarget_{0.0F}, djBeatsTarget_{0.0F};
    std::atomic<bool> energyProgramManaged_{false};
    std::atomic<float> highlightBefore_{0.70F}, highlightAfter_{0.80F}, highlightRampSeconds_{1.5F};
    float djVolume_{1.0F}, djEnergy_{0.0F}, djVocals_{0.0F}, djBeats_{0.0F};
    float djEnergyGain_{1.0F};
    int djCountdown_{0};
    std::atomic<bool> timedEnabled_{false};
    std::atomic<double> timedCueSeconds_{165.0}, mediaSeconds_{0.0};
    std::array<std::atomic<float>, 6> previewSettings_{};
    std::atomic<unsigned> previewRequest_{0};
    unsigned previewApplied_{0};
    std::int64_t previewFrame_{-1}, processedFrames_{0};
    std::array<std::atomic<float>, 7> runtimeSnapshot_{};
    struct Biquad final {
        double b0{1.0};
        double b1{0.0};
        double b2{0.0};
        double a1{0.0};
        double a2{0.0};
        std::array<double, 2> z1{};
        std::array<double, 2> z2{};

        static Biquad highPass(double sampleRate, double frequency, double q) noexcept;
        static Biquad peaking(
            double sampleRate,
            double frequency,
            double q,
            double gainDb) noexcept;
        static Biquad highShelf(
            double sampleRate,
            double frequency,
            double slope,
            double gainDb) noexcept;
        void setPeaking(
            double sampleRate,
            double frequency,
            double q,
            double gainDb) noexcept;
        void setHighShelf(
            double sampleRate,
            double frequency,
            double slope,
            double gainDb) noexcept;

        [[nodiscard]] inline float tick(float input, std::size_t channel) noexcept {
            const double value = static_cast<double>(input);
            const double output = b0 * value + z1[channel];
            z1[channel] = b1 * value - a1 * output + z2[channel];
            z2[channel] = b2 * value - a2 * output;
            // Anti-denormal guard: protects against CPU penalty on budget ARM cores
            if (std::abs(z1[channel]) < 1.0e-20) z1[channel] = 0.0;
            if (std::abs(z2[channel]) < 1.0e-20) z2[channel] = 0.0;
            if (!std::isfinite(output) || !std::isfinite(z1[channel]) || !std::isfinite(z2[channel])) {
                z1[channel] = 0.0;
                z2[channel] = 0.0;
                return 0.0F;
            }
            return static_cast<float>(output);
        }

        [[nodiscard]] double magnitude(double sampleRate, double frequency) const noexcept;

        inline void clear() noexcept {
            z1.fill(0.0);
            z2.fill(0.0);
        }
    };

    struct Crossfeed final {
        double a0Low{0.0};
        double b1Low{0.0};
        double a0High{1.0};
        double a1High{0.0};
        double b1High{0.0};
        double gain{1.0};
        std::array<double, 2> low{};
        std::array<double, 2> high{};
        std::array<double, 2> previousInput{};

        void configure(double sampleRate, double cutoffHz, double levelDb) noexcept;

        inline void process(float& left, float& right) noexcept {
            const double inputLeft = left;
            const double inputRight = right;
            low[0] = a0Low * inputLeft + b1Low * low[0];
            low[1] = a0Low * inputRight + b1Low * low[1];
            high[0] = a0High * inputLeft + a1High * previousInput[0] + b1High * high[0];
            high[1] = a0High * inputRight + a1High * previousInput[1] + b1High * high[1];
            previousInput[0] = inputLeft;
            previousInput[1] = inputRight;
            left = static_cast<float>((high[0] + low[1]) * gain);
            right = static_cast<float>((high[1] + low[0]) * gain);
        }

        inline void clear() noexcept {
            low.fill(0.0);
            high.fill(0.0);
            previousInput.fill(0.0);
        }
    };

    double sampleRate_{48000.0};
    float currentWet_{0.0F};
    float rampPerFrame_{1.0F / 2400.0F};
    std::atomic<bool> targetEnabled_{false};
    Biquad djVocalBand_, djBeatBand_;
    std::atomic<bool> bitPerfectEnabled_{false};
    std::atomic<bool> peakProtectionEnabled_{false};
    std::atomic<bool> targetEqualizerEnabled_{false};
    std::atomic<std::uint32_t> targetEqualizerRevision_{0};
    std::array<std::atomic<float>, kEqualizerBandCount> targetEqGainsDb_{};
    std::array<float, kEqualizerBandCount> currentEqGainsDb_{};
    std::array<Biquad, kEqualizerBandCount> equalizerBands_{};
    std::int32_t equalizerUpdateCountdown_{0};
    std::int32_t equalizerHeadroomCountdown_{0};
    std::uint32_t appliedEqualizerRevision_{0};
    std::uint16_t activeEqualizerBands_{0};
    float currentPreampDb_{0.0F};
    float currentPreampGain_{1.0F};
    float equalizerMaximumBoostDb_{0.0F};
    float limiterGain_{1.0F};
    float equalizerGainSmoothing_{0.1F};
    float limiterRelease_{0.001F};
    // One-pole DC blocker (10 Hz). Removes stream DC offset so peaks keep the
    // full symmetric headroom; transparent for DC-free program material.
    float dcBlockerR_{0.999F};
    std::array<double, 2> dcXPrev_{};
    std::array<double, 2> dcYPrev_{};
    std::int32_t microFadeFrameCount_{96};
    std::int32_t microFadePosition_{0};
    bool clarityChainActive_{false};
    // Clarity parameterization (see the setters above). Targets are atomic;
    // currents ease toward them with the existing ramps (wet follows the
    // 50 ms enable crossfade step, trims follow the equalizer gain easing
    // at the coefficient-refresh cadence). Neutral defaults keep the
    // shipping curve bit-identical: the mix factor stays exactly 1.0 and
    // no coefficient is ever rebuilt while trims are zero.
    std::atomic<float> targetClarityWet_{1.0F};
    float currentClarityWet_{1.0F};
    std::array<std::atomic<float>, kClarityTrimCount> targetClarityTrimsDb_{};
    std::array<float, kClarityTrimCount> currentClarityTrimsDb_{};
    std::array<float, kClarityTrimCount> appliedClarityTrimsDb_{};
    std::array<float, kClarityTrimCount> clarityTrimLinear_{
        1.0F, 1.0F, 1.0F, 1.0F, 1.0F, 1.0F, 1.0F, 1.0F};
    // Effective exciter level. Mirrors kAirExciterAmount in DspProcessor.cpp
    // while the exciter trim is neutral, so the default path is exact.
    float clarityExciterAmount_{0.18F};
    std::atomic<bool> atmosBypassEnabled_{false};
    std::atomic<bool> targetDjEnergyEnabled_{false};
    // Ultra-light vocal/energy detector. It deliberately avoids FFT/ML on the
    // renderer thread: a mid/side detector plus a 180 Hz..4 kHz vocal-band
    // envelope gives a stable vocal-confidence signal at negligible cost.
    float djBassState_{0.0F};
    float djVocalLowState_{0.0F};
    float djFullEnergy_{0.0F};
    float djVocalEnergy_{0.0F};
    float djSideEnergy_{0.0F};
    float djBassAlpha_{0.02F};
    float djVocalLowAlpha_{0.3F};
    float djEnvelopeAlpha_{0.001F};
    float djAttack_{0.001F};
    float djRelease_{0.0001F};
    float djGain_{1.0F};
    float djTargetGain_{1.0F};

    // True 3-second concert look-ahead. The media DSP stores already
    // processed future PCM in a fixed ring allocated during configure().
    // When an energy/vocal impact reaches the analyzer, the audible output is
    // still exactly three seconds earlier, so the requested 30/60/90 percent
    // pre-drop can be applied without guessing.
    bool longLookAheadMode_{false};
    std::unique_ptr<float[]> djLookAheadBuffer_{};
    std::size_t djLookAheadCapacityFrames_{0};
    std::size_t djLookAheadReadFrame_{0};
    std::size_t djLookAheadWriteFrame_{0};
    std::size_t djLookAheadFramesStored_{0};
    std::int32_t djLookAheadChannelCount_{0};
    float djBaselineEnergy_{0.0F};
    float djBaselineAlpha_{0.0001F};
    float djAppliedDropGain_{1.0F};
    float djDropGainSmoothing_{0.01F};
    std::int64_t djPreDropFramesRemaining_{0};
    std::int64_t djTriggerCooldownFrames_{0};
    std::int32_t djControlCountdown_{0};

    [[nodiscard]] float nextDjPreDropGain() noexcept;
    Biquad subBassHighPass_{};
    Biquad bassFoundation_{};
    Biquad lowMidSeparation_{};
    Biquad boxinessControl_{};
    Biquad presenceDetail_{};
    Biquad airDetail_{};
    Biquad monoBassFilter_{};
    Biquad airExciterFilter_{};
    Crossfeed crossfeed_{};

    // Rebuilds one trimmed stage from its design spec plus the smoothed
    // trim value. Peaking/shelf stages keep filter state (coefficients
    // only, like the equalizer path); high-pass stages update their linear
    // post gain. Control-rate only, called from the coefficient tick.
    void applyClarityTrim(std::size_t stage, float trimDb) noexcept;
};

}  // namespace lastwave::audio
