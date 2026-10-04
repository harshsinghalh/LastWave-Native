#include "DspProcessor.h"
#include "GeneratedPersonalDjProfile.h"

#include <algorithm>
#include <cmath>
#include <mutex>
#include <new>
#include <vector>

namespace lastwave::audio {
namespace {

constexpr double kPi = 3.1415926535897932384626433832795;
constexpr std::array<double, DspProcessor::kEqualizerBandCount> kEqFrequenciesHz{
    25.0, 40.0, 63.0, 100.0, 160.0,
    250.0, 400.0, 630.0, 1000.0, 1600.0,
    2500.0, 4000.0, 6300.0, 10000.0, 16000.0,
};
// Updating 15 biquads every 32 samples was needlessly expensive while a
// preset was smoothing. 128 samples is still below perceptual control
// latency, while headroom analysis can run much less frequently because the
// sample limiter covers the short transition between analyses.
constexpr std::int32_t kEqCoefficientIntervalFrames = 128;
constexpr std::int32_t kEqHeadroomIntervalFrames = 1024;
// Optimal Q = sqrt(2) eliminates resonant ripple between 2/3-octave ISO bands for studio-grade smoothness.
constexpr double kEqQ = 1.4142135623730951;
// -0.5 dBFS ceiling protects against true-peak clipping while maintaining high dynamic impact.
constexpr float kOutputCeiling = 0.944060876F;
// -1.5 dBFS soft-knee threshold: perfectly linear below this.
constexpr float kSoftKneeThreshold = 0.841395141F;
constexpr float kEqualizerPreLimiterBoostDb = 1.0F;
constexpr float kClarityMakeupGain = 1.04F;
constexpr float kClarityStereoWidth = 1.22F;
constexpr float kAirExciterAmount = 0.18F;
constexpr std::int32_t kDjControlIntervalFrames = 256;
// User-requested concert envelope:
// T-3s..T-2s: 30% quieter (70% gain)
// T-2s..T-1s: 60% quieter (40% gain)
// T-1s..impact: 90% quieter (10% gain)
// impact: return to normal 100% gain.
constexpr double kDjLongLookAheadSeconds = 3.0;
constexpr double kDjDropStepSeconds = 1.0;
constexpr float kDjDropGainStage1 = 0.70F;
constexpr float kDjDropGainStage2 = 0.40F;
constexpr float kDjDropGainStage3 = 0.10F;
constexpr double kDjDropTransitionSeconds = 0.006;
constexpr double kDjBaselineSeconds = 1.25;
constexpr double kDjTriggerCooldownSeconds = 4.5;
constexpr float kDjStrongSurgeDb = personal_dj::kStrongSurgeDb;
constexpr float kDjLoudSurgeDb = personal_dj::kLoudSurgeDb;
// Studio Master Clarity design gains (dB). Single source for configure()
// and trim rebuilds; per-stage trims add to these values.
constexpr double kClarityBassGainDb = 3.2;
constexpr double kClarityLowMidGainDb = -3.0;
constexpr double kClarityBoxinessGainDb = -1.4;
constexpr double kClarityPresenceGainDb = 3.8;
constexpr double kClarityAirGainDb = 4.8;
constexpr float kClarityTrimMinDb = -12.0F;
constexpr float kClarityTrimMaxDb = 12.0F;
// Native preset trim vectors in header-documented stage order 0..7.
// Mirrored as data in ClarityPresets.kt; REFERENCE is all zeros.
constexpr std::array<float, DspProcessor::kClarityTrimCount> kClarityPresetReferenceTrims{
    0.0F, 0.0F, 0.0F, 0.0F, 0.0F, 0.0F, 0.0F, 0.0F};
// SPEAKER: reduced sub-bass lift for small drivers, slightly gentler air.
constexpr std::array<float, DspProcessor::kClarityTrimCount> kClarityPresetSpeakerTrims{
    0.0F, -1.5F, 0.0F, 0.0F, 0.0F, -0.5F, 0.0F, 0.0F};
// HEADPHONE: close-coupled drivers exaggerate bass and presence.
constexpr std::array<float, DspProcessor::kClarityTrimCount> kClarityPresetHeadphoneTrims{
    0.0F, -0.5F, 0.0F, 0.0F, -1.0F, 0.0F, 0.0F, 0.0F};
// DAC: revealing downstream chain, gentler top octave.
constexpr std::array<float, DspProcessor::kClarityTrimCount> kClarityPresetDacTrims{
    0.0F, 0.0F, 0.0F, 0.0F, 0.0F, -1.5F, 0.0F, -1.0F};

double safeFrequency(double sampleRate, double frequency) noexcept {
    return std::clamp(frequency, 1.0, sampleRate * 0.45);
}

float sanitizedClarityTrim(float trimDb) noexcept {
    if (!std::isfinite(trimDb)) return 0.0F;
    return std::clamp(trimDb, kClarityTrimMinDb, kClarityTrimMaxDb);
}

float clarityTrimLinearGain(float trimDb) noexcept {
    // Exact unity for the neutral default, so untouched stages stay
    // bit-identical without needing a bypass branch in the audio loop.
    if (trimDb == 0.0F) return 1.0F;
    return std::pow(10.0F, trimDb / 20.0F);
}

// Live-instance registry backing the JNI broadcast helpers. Control thread
// only (construction, destruction, JNI setters); the audio thread never
// touches it.
std::mutex& clarityRegistryMutex() {
    static std::mutex mutex;
    return mutex;
}

std::vector<DspProcessor*>& clarityRegistry() {
    static std::vector<DspProcessor*> instances;
    return instances;
}

}  // namespace

DspProcessor::DspProcessor() noexcept {
    for (auto& gain : targetEqGainsDb_) gain.store(0.0F, std::memory_order_relaxed);
    for (auto& trim : targetClarityTrimsDb_) trim.store(0.0F, std::memory_order_relaxed);
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    clarityRegistry().push_back(this);
}

DspProcessor::~DspProcessor() {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    auto& instances = clarityRegistry();
    instances.erase(
        std::remove(instances.begin(), instances.end(), this),
        instances.end());
}

void DspProcessor::configure(double sampleRate) noexcept {
    sampleRate_ = std::max(sampleRate, 8000.0);
    // Snap clarity parameterization set before the stream opened. Neutral
    // trims add exactly 0.0 to the design gains below, so the default
    // coefficients are unchanged from the previous fixed chain.
    currentClarityWet_ = std::clamp(
        targetClarityWet_.load(std::memory_order_acquire), 0.0F, 1.0F);
    for (std::size_t stage = 0; stage < kClarityTrimCount; ++stage) {
        const float trim = sanitizedClarityTrim(
            targetClarityTrimsDb_[stage].load(std::memory_order_acquire));
        currentClarityTrimsDb_[stage] = trim;
        appliedClarityTrimsDb_[stage] = trim;
        clarityTrimLinear_[stage] = clarityTrimLinearGain(trim);
    }
    clarityExciterAmount_ = kAirExciterAmount * clarityTrimLinear_[7];
    // Studio Master Clarity Acoustic Contouring:
    // 1. Subsonic highpass: tight 24 Hz cutoff removes rumble and saves amp headroom
    subBassHighPass_ = Biquad::highPass(sampleRate_, 24.0, 0.7071067811865476);
    // 2. Bass foundation: punchy 72 Hz body with controlled bandwidth
    bassFoundation_ = Biquad::peaking(
        sampleRate_, 72.0, 0.80,
        kClarityBassGainDb + static_cast<double>(currentClarityTrimsDb_[1]));
    // 3. Low-mid anti-mud: surgical 280 Hz dip removes boxiness and unmasks vocals
    lowMidSeparation_ = Biquad::peaking(
        sampleRate_, 280.0, 0.90,
        kClarityLowMidGainDb + static_cast<double>(currentClarityTrimsDb_[2]));
    // 4. Boxiness & resonance control: smooth 750 Hz control
    boxinessControl_ = Biquad::peaking(
        sampleRate_, 750.0, 0.85,
        kClarityBoxinessGainDb + static_cast<double>(currentClarityTrimsDb_[3]));
    // 5. Vocal presence & instrument detail: articulate 3400 Hz lift
    presenceDetail_ = Biquad::peaking(
        sampleRate_, 3400.0, 0.85,
        kClarityPresenceGainDb + static_cast<double>(currentClarityTrimsDb_[4]));
    // 6. Silky air shelf: pristine 10.5 kHz high-frequency extension
    airDetail_ = Biquad::highShelf(
        sampleRate_, 10500.0, 0.85,
        kClarityAirGainDb + static_cast<double>(currentClarityTrimsDb_[5]));
    // 7. Mono-Bass filter: 130 Hz highpass for Side channel (locks low-end to center, zero blur)
    monoBassFilter_ = Biquad::highPass(sampleRate_, 130.0, 0.7071067811865476);
    // 8. Harmonic air exciter: 6000 Hz highpass to isolate highs for tape-style harmonic sheen
    airExciterFilter_ = Biquad::highPass(sampleRate_, 6000.0, 0.7071067811865476);
    crossfeed_.configure(sampleRate_, 700.0, 4.5);
    rampPerFrame_ = static_cast<float>(1.0 / (sampleRate_ * 0.050));
    equalizerGainSmoothing_ = static_cast<float>(1.0 - std::exp(
        -static_cast<double>(kEqCoefficientIntervalFrames) / (sampleRate_ * 0.010)));
    limiterRelease_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * 0.150)));
    djBassAlpha_ = static_cast<float>(
        1.0 - std::exp(-2.0 * kPi * 180.0 / sampleRate_));
    djVocalLowAlpha_ = static_cast<float>(
        1.0 - std::exp(-2.0 * kPi * 4000.0 / sampleRate_));
    djEnvelopeAlpha_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * 0.020)));
    djAttack_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * 0.080)));
    djRelease_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * 0.350)));
    djBaselineAlpha_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * kDjBaselineSeconds)));
    djDropGainSmoothing_ = static_cast<float>(
        1.0 - std::exp(-1.0 / (sampleRate_ * kDjDropTransitionSeconds)));

    // Allocate once, outside the renderer loop. Two floats per frame cover
    // stereo; mono uses the left lane. Allocation failure safely disables the
    // long-look-ahead path instead of risking an audio-thread allocation.
    djLookAheadCapacityFrames_ = static_cast<std::size_t>(
        std::max<std::int64_t>(1, std::llround(sampleRate_ * kDjLongLookAheadSeconds)));
    const std::size_t lookAheadSamples = djLookAheadCapacityFrames_ * 2U;
    djLookAheadBuffer_.reset(new (std::nothrow) float[lookAheadSamples]);
    if (djLookAheadBuffer_ != nullptr) {
        std::fill_n(djLookAheadBuffer_.get(), lookAheadSamples, 0.0F);
    } else {
        djLookAheadCapacityFrames_ = 0;
    }
    dcBlockerR_ = static_cast<float>(
        std::exp(-2.0 * kPi * 10.0 / sampleRate_));
    microFadeFrameCount_ = std::max(
        1,
        static_cast<std::int32_t>(std::llround(sampleRate_ * 0.002)));
    currentWet_ = targetEnabled_.load(std::memory_order_acquire) ? 1.0F : 0.0F;
    const bool equalizerEnabled = targetEqualizerEnabled_.load(std::memory_order_acquire);
    activeEqualizerBands_ = 0;
    for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
        const bool bandFitsOutputRate = kEqFrequenciesHz[band] < sampleRate_ * 0.45;
        currentEqGainsDb_[band] = equalizerEnabled && bandFitsOutputRate
            ? targetEqGainsDb_[band].load(std::memory_order_acquire)
            : 0.0F;
        if (std::abs(currentEqGainsDb_[band]) >= 0.0005F) {
            equalizerBands_[band] = Biquad::peaking(
                sampleRate_, kEqFrequenciesHz[band], kEqQ, currentEqGainsDb_[band]);
            activeEqualizerBands_ |= static_cast<std::uint16_t>(1U << band);
        } else {
            equalizerBands_[band] = Biquad{};
        }
    }
    equalizerMaximumBoostDb_ = 0.0F;
    if (activeEqualizerBands_ != 0U) {
        for (std::size_t point = 0; point < kEqualizerBandCount * 2U - 1U; ++point) {
            const double frequency = point % 2U == 0U
                ? kEqFrequenciesHz[point / 2U]
                : std::sqrt(kEqFrequenciesHz[point / 2U] * kEqFrequenciesHz[point / 2U + 1U]);
            double magnitude = 1.0;
            for (const auto& band : equalizerBands_) {
                magnitude *= band.magnitude(sampleRate_, frequency);
            }
            equalizerMaximumBoostDb_ = std::max(
                equalizerMaximumBoostDb_,
                static_cast<float>(20.0 * std::log10(std::max(magnitude, 1.0e-12))));
        }
    }
    // Only explicit EQ boost reserves static headroom. Clarity and peak
    // protection use the linked limiter instead; permanently subtracting
    // 2-3 dB here was the main reason bypass sounded better.
    currentPreampDb_ = activeEqualizerBands_ != 0U
        ? -std::max(0.0F, equalizerMaximumBoostDb_ - kEqualizerPreLimiterBoostDb)
        : 0.0F;
    currentPreampGain_ = std::pow(10.0F, currentPreampDb_ / 20.0F);
    equalizerUpdateCountdown_ = 0;
    equalizerHeadroomCountdown_ = 0;
    appliedEqualizerRevision_ = targetEqualizerRevision_.load(std::memory_order_acquire);
    limiterGain_ = 1.0F;
    clarityChainActive_ = currentWet_ > 0.0F;
    reset();
}

void DspProcessor::reset() noexcept {
    highlights_.configure(sampleRate_);
    highlightWasEnabled_ = false;
    layaWasEnabled_ = false;
    featureCountdown_ = 0;
    for (auto& feature : featureSnapshot_) feature.store(0.0F);
    djVolume_ = djVolumeTarget_.load();
    djEnergy_ = djVocals_ = djBeats_ = 0.0F;
    djEnergyGain_ = 1.0F;
    djCountdown_ = 0;
    djVocalBand_.clear(); djBeatBand_.clear();
    subBassHighPass_.clear();
    bassFoundation_.clear();
    lowMidSeparation_.clear();
    boxinessControl_.clear();
    presenceDetail_.clear();
    airDetail_.clear();
    monoBassFilter_.clear();
    airExciterFilter_.clear();
    crossfeed_.clear();
    for (auto& band : equalizerBands_) band.clear();
    limiterGain_ = 1.0F;
    djBassState_ = 0.0F;
    djVocalLowState_ = 0.0F;
    djFullEnergy_ = 0.0F;
    djVocalEnergy_ = 0.0F;
    djSideEnergy_ = 0.0F;
    djGain_ = 1.0F;
    djTargetGain_ = 1.0F;
    djBaselineEnergy_ = 0.0F;
    djAppliedDropGain_ = 1.0F;
    djPreDropFramesRemaining_ = 0;
    djTriggerCooldownFrames_ = 0;
    djControlCountdown_ = 0;
    djLookAheadReadFrame_ = 0;
    djLookAheadWriteFrame_ = 0;
    djLookAheadFramesStored_ = 0;
    djLookAheadChannelCount_ = 0;
    if (djLookAheadBuffer_ != nullptr && djLookAheadCapacityFrames_ > 0) {
        std::fill_n(
            djLookAheadBuffer_.get(),
            djLookAheadCapacityFrames_ * 2U,
            0.0F);
    }
    microFadePosition_ = 0;
    dcXPrev_.fill(0.0);
    dcYPrev_.fill(0.0);
}

void DspProcessor::setStudioMasterClarity(bool enabled) noexcept {
    targetEnabled_.store(enabled, std::memory_order_release);
}

void DspProcessor::setBitPerfect(bool enabled) noexcept {
    bitPerfectEnabled_.store(enabled, std::memory_order_release);
}

void DspProcessor::setPeakProtectionEnabled(bool enabled) noexcept {
    peakProtectionEnabled_.store(enabled, std::memory_order_release);
}

void DspProcessor::setEqualizer(
    bool enabled,
    const float* gainsDb,
    std::size_t gainCount) noexcept {
    if (gainsDb != nullptr && gainCount == kEqualizerBandCount) {
        for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
            const float safeGain = std::isfinite(gainsDb[band]) ? gainsDb[band] : 0.0F;
            targetEqGainsDb_[band].store(
                std::clamp(safeGain, -8.0F, 8.0F),
                std::memory_order_release);
        }
    }
    targetEqualizerEnabled_.store(enabled, std::memory_order_release);
    targetEqualizerRevision_.fetch_add(1, std::memory_order_release);
}

void DspProcessor::setClarityWet(float wet) noexcept {
    if (!std::isfinite(wet)) wet = 1.0F;
    targetClarityWet_.store(std::clamp(wet, 0.0F, 1.0F), std::memory_order_release);
}

void DspProcessor::setClarityTrims(const float* trimsDb, std::size_t trimCount) noexcept {
    if (trimsDb != nullptr && trimCount == kClarityTrimCount) {
        for (std::size_t stage = 0; stage < kClarityTrimCount; ++stage) {
            targetClarityTrimsDb_[stage].store(
                sanitizedClarityTrim(trimsDb[stage]),
                std::memory_order_release);
        }
    }
}

void DspProcessor::setClarityPreset(int preset) noexcept {
    const float* trims = nullptr;
    switch (preset) {
        case kClarityPresetReference:
            trims = kClarityPresetReferenceTrims.data();
            break;
        case kClarityPresetSpeaker:
            trims = kClarityPresetSpeakerTrims.data();
            break;
        case kClarityPresetHeadphone:
            trims = kClarityPresetHeadphoneTrims.data();
            break;
        case kClarityPresetDac:
            trims = kClarityPresetDacTrims.data();
            break;
        default:
            return;
    }
    setClarityTrims(trims, kClarityTrimCount);
}

void DspProcessor::setClarityAtmosBypass(bool bypass) noexcept {
    atmosBypassEnabled_.store(bypass, std::memory_order_release);
}

void DspProcessor::setDjEnergyEnabled(bool enabled) noexcept {
    targetDjEnergyEnabled_.store(enabled, std::memory_order_release);
}

void DspProcessor::setLongLookAheadMode(bool enabled) noexcept {
    if (longLookAheadMode_ == enabled) return;
    longLookAheadMode_ = enabled;
    djLookAheadReadFrame_ = 0;
    djLookAheadWriteFrame_ = 0;
    djLookAheadFramesStored_ = 0;
    djLookAheadChannelCount_ = 0;
    djPreDropFramesRemaining_ = 0;
    djTriggerCooldownFrames_ = 0;
    djAppliedDropGain_ = 1.0F;
    if (djLookAheadBuffer_ != nullptr && djLookAheadCapacityFrames_ > 0) {
        std::fill_n(
            djLookAheadBuffer_.get(),
            djLookAheadCapacityFrames_ * 2U,
            0.0F);
    }
}

void DspProcessor::broadcastClarityWet(float wet) {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    for (auto* instance : clarityRegistry()) {
        if (instance != nullptr) instance->setClarityWet(wet);
    }
}

void DspProcessor::broadcastClarityTrims(const float* trimsDb, std::size_t trimCount) {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    for (auto* instance : clarityRegistry()) {
        if (instance != nullptr) instance->setClarityTrims(trimsDb, trimCount);
    }
}

void DspProcessor::broadcastClarityPreset(int preset) {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    for (auto* instance : clarityRegistry()) {
        if (instance != nullptr) instance->setClarityPreset(preset);
    }
}

void DspProcessor::broadcastClarityAtmosBypass(bool bypass) {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    for (auto* instance : clarityRegistry()) {
        if (instance != nullptr) instance->setClarityAtmosBypass(bypass);
    }
}

void DspProcessor::broadcastDjEnergyEnabled(bool enabled) {
    std::lock_guard<std::mutex> registryLock(clarityRegistryMutex());
    for (auto* instance : clarityRegistry()) {
        if (instance != nullptr) instance->setDjEnergyEnabled(enabled);
    }
}

void DspProcessor::applyClarityTrim(std::size_t stage, float trimDb) noexcept {
    const double trim = static_cast<double>(trimDb);
    switch (stage) {
        case 1:
            bassFoundation_.setPeaking(
                sampleRate_, 72.0, 0.80, kClarityBassGainDb + trim);
            break;
        case 2:
            lowMidSeparation_.setPeaking(
                sampleRate_, 280.0, 0.90, kClarityLowMidGainDb + trim);
            break;
        case 3:
            boxinessControl_.setPeaking(
                sampleRate_, 750.0, 0.85, kClarityBoxinessGainDb + trim);
            break;
        case 4:
            presenceDetail_.setPeaking(
                sampleRate_, 3400.0, 0.85, kClarityPresenceGainDb + trim);
            break;
        case 5:
            airDetail_.setHighShelf(
                sampleRate_, 10500.0, 0.85, kClarityAirGainDb + trim);
            break;
        case 0:
        case 6:
        case 7:
            clarityTrimLinear_[stage] = clarityTrimLinearGain(trimDb);
            clarityExciterAmount_ = kAirExciterAmount * clarityTrimLinear_[7];
            break;
        default:
            break;
    }
}

float DspProcessor::nextDjPreDropGain() noexcept {
    float targetGain = 1.0F;
    if (djPreDropFramesRemaining_ > 0 && sampleRate_ > 0.0) {
        const auto stepFrames = std::max<std::int64_t>(
            1,
            static_cast<std::int64_t>(std::llround(sampleRate_ * kDjDropStepSeconds)));
        if (djPreDropFramesRemaining_ > stepFrames * 2) {
            targetGain = kDjDropGainStage1;
        } else if (djPreDropFramesRemaining_ > stepFrames) {
            targetGain = kDjDropGainStage2;
        } else {
            targetGain = kDjDropGainStage3;
        }
        --djPreDropFramesRemaining_;
    }

    // A 6 ms de-click ramp is perceptually instantaneous at the hit but avoids
    // a waveform discontinuity when moving between 70/40/10/100 percent.
    djAppliedDropGain_ +=
        (targetGain - djAppliedDropGain_) * djDropGainSmoothing_;
    if (std::abs(targetGain - djAppliedDropGain_) < 0.0001F) {
        djAppliedDropGain_ = targetGain;
    }
    return djAppliedDropGain_;
}

std::size_t DspProcessor::flushLookAhead(
    float* interleaved,
    std::size_t frameCapacity,
    std::int32_t channelCount) noexcept {
    if (interleaved == nullptr || frameCapacity == 0 ||
        (channelCount != 1 && channelCount != 2) ||
        djLookAheadBuffer_ == nullptr ||
        djLookAheadCapacityFrames_ == 0 ||
        djLookAheadFramesStored_ == 0) {
        return 0;
    }

    const std::size_t framesToWrite =
        std::min(frameCapacity, djLookAheadFramesStored_);
    for (std::size_t frame = 0; frame < framesToWrite; ++frame) {
        const std::size_t readOffset = djLookAheadReadFrame_ * 2U;
        const float gain = nextDjPreDropGain();
        const std::size_t outputOffset =
            frame * static_cast<std::size_t>(channelCount);
        interleaved[outputOffset] = djLookAheadBuffer_[readOffset] * gain;
        if (channelCount == 2) {
            interleaved[outputOffset + 1U] =
                djLookAheadBuffer_[readOffset + 1U] * gain;
        }
        djLookAheadReadFrame_ =
            (djLookAheadReadFrame_ + 1U) % djLookAheadCapacityFrames_;
        --djLookAheadFramesStored_;
    }

    if (djLookAheadFramesStored_ == 0U) {
        djLookAheadReadFrame_ = 0;
        djLookAheadWriteFrame_ = 0;
        djPreDropFramesRemaining_ = 0;
        djAppliedDropGain_ = 1.0F;
    }
    return framesToWrite;
}

void DspProcessor::setDjCue(float volume, float energyDb, float vocalsDb, float beatsDb) noexcept {
    auto safe = [](float x, float fallback, float lo, float hi) {
        return std::isfinite(x) ? std::clamp(x, lo, hi) : fallback;
    };
    djVolumeTarget_.store(safe(volume, 1.0F, 0.0F, 1.0F));
    djEnergyTarget_.store(safe(energyDb, 0.0F, 0.0F, 6.0F));
    djVocalsTarget_.store(safe(vocalsDb, 0.0F, 0.0F, 6.0F));
    djBeatsTarget_.store(safe(beatsDb, 0.0F, 0.0F, 6.0F));
}

void DspProcessor::setDjHighlights(bool enabled, int focus, int spacing,
    float energyDb, float vocalsDb, float beatsDb) noexcept {
    auto safe = [](float x) { return std::isfinite(x) ? std::clamp(x, 0.0F, 6.0F) : 0.0F; };
    highlightFocus_.store(std::clamp(focus, 0, 2));
    highlightSpacing_.store(std::clamp(spacing, 0, 1));
    highlightEnergy_.store(safe(energyDb));
    highlightVocals_.store(safe(vocalsDb));
    highlightBeats_.store(safe(beatsDb));
    highlightEnabled_.store(enabled, std::memory_order_release);
}

void DspProcessor::setDjLayaDecision(int generation, int candidate, bool accepted) noexcept {
    layaAccepted_.store(false, std::memory_order_release);
    layaGeneration_.store(generation);
    layaCandidate_.store(candidate);
    layaAccepted_.store(accepted, std::memory_order_release);
}

std::array<float, 8> DspProcessor::djFeatures() const noexcept {
    std::array<float, 8> result{};
    for (std::size_t i = 0; i < result.size(); ++i) result[i] = featureSnapshot_[i].load();
    return result;
}

void DspProcessor::process(
    float* samples,
    std::int32_t frameCount,
    std::int32_t channelCount) noexcept {
    if (samples == nullptr || frameCount <= 0 || (channelCount != 1 && channelCount != 2)) return;
    if (bitPerfectEnabled_.load(std::memory_order_acquire)) {
        highlights_.reset();
        for (auto& feature : featureSnapshot_) feature.store(0.0F);
        return;
    }
    // Atmos-aware bypass forces the clarity chain off independent of the
    // on/off toggle, keeping multichannel/spatial content untouched while
    // preserving the toggle state for stereo afterwards.
    const bool atmosBypassed = atmosBypassEnabled_.load(std::memory_order_acquire);
    const float target = (targetEnabled_.load(std::memory_order_acquire) && !atmosBypassed)
        ? 1.0F
        : 0.0F;
    const bool peakProtectionEnabled = peakProtectionEnabled_.load(std::memory_order_acquire);
    const bool djEnabled =
        targetDjEnergyEnabled_.load(std::memory_order_acquire) &&
        longLookAheadMode_ &&
        djLookAheadBuffer_ != nullptr &&
        djLookAheadCapacityFrames_ > 0;
    // Selective automation runs once, on decoded PCM; never on the Oboe
    // output a second time. The older three-second DJ Energy keeps priority.
    const bool highlightEnabled = highlightEnabled_.load(std::memory_order_acquire) &&
        longLookAheadMode_ && !djEnabled && !atmosBypassed;
    const bool layaEnabled = layaEnabled_.load() && highlightEnabled;
    const int highlightFocus = highlightFocus_.load();
    const int highlightSpacing = highlightSpacing_.load();
    if (highlightEnabled != highlightWasEnabled_ || layaEnabled != layaWasEnabled_ ||
        highlightFocus != highlightWasFocus_ || highlightSpacing != highlightWasSpacing_) {
        highlights_.reset();
        highlightWasEnabled_ = highlightEnabled;
        layaWasEnabled_ = layaEnabled;
        highlightWasFocus_ = highlightFocus;
        highlightWasSpacing_ = highlightSpacing;
        featureCountdown_ = 0;
        for (auto& feature : featureSnapshot_) feature.store(0.0F);
    }
    const float highlightEnergy = highlightEnergy_.load();
    const float highlightVocals = highlightVocals_.load();
    const float highlightBeats = highlightBeats_.load();
    const auto equalizerRevision = targetEqualizerRevision_.load(std::memory_order_acquire);
    if (equalizerRevision != appliedEqualizerRevision_) {
        appliedEqualizerRevision_ = equalizerRevision;
        equalizerUpdateCountdown_ = 0;
        equalizerHeadroomCountdown_ = 0;
    }
    if (target > 0.0F) clarityChainActive_ = true;

    bool targetEqualizerHasGain = false;
    if (targetEqualizerEnabled_.load(std::memory_order_acquire)) {
        for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
            if (kEqFrequenciesHz[band] < sampleRate_ * 0.45 &&
                std::abs(targetEqGainsDb_[band].load(std::memory_order_acquire)) >= 0.0005F) {
                targetEqualizerHasGain = true;
                break;
            }
        }
    }
    const bool djActive = djVolumeTarget_.load() != 1.0F || djEnergyTarget_.load() != 0.0F ||
        djVocalsTarget_.load() != 0.0F || djBeatsTarget_.load() != 0.0F ||
        djVolume_ != 1.0F || djEnergy_ != 0.0F || djVocals_ != 0.0F || djBeats_ != 0.0F;
    const bool enhancementTargeted = djActive || target > 0.0F ||
        targetEqualizerHasGain || djEnabled;
    const bool enhancementStateActive = currentWet_ > 0.0F ||
        activeEqualizerBands_ != 0U ||
        std::abs(currentPreampGain_ - 1.0F) >= 0.00001F ||
        std::abs(djGain_ - 1.0F) >= 0.00001F ||
        std::abs(limiterGain_ - 1.0F) >= 0.00001F;
    // Peak protection is needed while an enhancement is active or releasing,
    // not on untouched program material. This restores a sample-transparent
    // bypass instead of permanently lowering ordinary 0 dBFS masters to -1 dB.
    const bool protectionRequired = peakProtectionEnabled &&
        (enhancementTargeted || enhancementStateActive);
    const bool controlsBypassed = !enhancementTargeted && !protectionRequired;
    const bool stateBypassed = currentWet_ == 0.0F &&
        activeEqualizerBands_ == 0U &&
        std::abs(currentPreampGain_ - 1.0F) < 0.00001F &&
        std::abs(djGain_ - 1.0F) < 0.00001F &&
        std::abs(limiterGain_ - 1.0F) < 0.00001F;
    // With every enhancement disabled, decoded PCM stays transparent. This
    // avoids the old unconditional -1 dB attenuation and limiter/clamp pass.
    if (controlsBypassed && stateBypassed && !highlightEnabled) return;

    for (std::int32_t frame = 0; frame < frameCount; ++frame) {
        const std::size_t rawOffset = static_cast<std::size_t>(frame) * static_cast<std::size_t>(channelCount);
        const bool layaApproved = layaAccepted_.load(std::memory_order_acquire) &&
            layaGeneration_.load() == highlights_.generation() && layaCandidate_.load() == highlights_.candidateId();
        const auto highlight = highlightEnabled ? highlights_.tick(samples[rawOffset],
            channelCount == 2 ? samples[rawOffset + 1U] : samples[rawOffset], highlightFocus, highlightSpacing, layaEnabled, layaApproved)
            : DjHighlightDetector::Mix{};
        if (highlightEnabled && featureCountdown_-- <= 0) {
            const auto features = highlights_.features();
            for (std::size_t i = 0; i < features.size(); ++i) featureSnapshot_[i].store(features[i]);
            featureCountdown_ = 127;
        }
        const bool highlightActive = highlight.volume != 1.0F || highlight.boost != 0.0F;
        const bool cueReleasing = djVolume_ != 1.0F || djEnergy_ != 0.0F || djVocals_ != 0.0F || djBeats_ != 0.0F;
        // Analyze untouched audio without sending ordinary passages through
        // the DC blocker, saturation or limiter. This is sample-transparent.
        if (controlsBypassed && stateBypassed && !highlightActive && !cueReleasing) continue;
        const bool frameProtectionRequired = protectionRequired ||
            (peakProtectionEnabled && (highlightActive || cueReleasing));
        if (currentWet_ < target) {
            currentWet_ = std::min(target, currentWet_ + rampPerFrame_);
        } else if (currentWet_ > target) {
            currentWet_ = std::max(target, currentWet_ - rampPerFrame_);
        }
        // Clarity wet/dry mix follows the same 50 ms ramp so mix and preset
        // moves never click. At the default 1.0 the factor stays exactly
        // 1.0, keeping the output bit-identical.
        const float targetClarityMix = targetClarityWet_.load(std::memory_order_acquire);
        if (currentClarityWet_ < targetClarityMix) {
            currentClarityWet_ = std::min(targetClarityMix, currentClarityWet_ + rampPerFrame_);
        } else if (currentClarityWet_ > targetClarityMix) {
            currentClarityWet_ = std::max(targetClarityMix, currentClarityWet_ - rampPerFrame_);
        }

        if (equalizerUpdateCountdown_-- <= 0) {
            const bool eqEnabled = targetEqualizerEnabled_.load(std::memory_order_acquire);
            bool coefficientsChanged = false;
            std::uint16_t nextActiveBands = 0;
            if (eqEnabled || activeEqualizerBands_ != 0U) {
                for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
                    const bool bandFitsOutputRate = kEqFrequenciesHz[band] < sampleRate_ * 0.45;
                    const float targetGain = eqEnabled && bandFitsOutputRate
                        ? targetEqGainsDb_[band].load(std::memory_order_acquire)
                        : 0.0F;
                    const float previousGain = currentEqGainsDb_[band];
                    currentEqGainsDb_[band] +=
                        (targetGain - currentEqGainsDb_[band]) * equalizerGainSmoothing_;
                    if (std::abs(targetGain - currentEqGainsDb_[band]) < 0.0005F) {
                        currentEqGainsDb_[band] = targetGain;
                    }
                    const bool bandChanged =
                        std::abs(previousGain - currentEqGainsDb_[band]) > 0.000001F;
                    coefficientsChanged = coefficientsChanged || bandChanged;
                    if (bandChanged) {
                        equalizerBands_[band].setPeaking(
                            sampleRate_, kEqFrequenciesHz[band], kEqQ, currentEqGainsDb_[band]);
                    }
                    if (std::abs(currentEqGainsDb_[band]) >= 0.0005F ||
                        std::abs(targetGain) >= 0.0005F) {
                        nextActiveBands |= static_cast<std::uint16_t>(1U << band);
                    }
                }
            }
            const auto deactivatedBands = static_cast<std::uint16_t>(
                activeEqualizerBands_ & static_cast<std::uint16_t>(~nextActiveBands));
            for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
                if ((deactivatedBands & static_cast<std::uint16_t>(1U << band)) != 0U) {
                    equalizerBands_[band].clear();
                }
            }
            activeEqualizerBands_ = nextActiveBands;
            if (activeEqualizerBands_ == 0U) {
                equalizerMaximumBoostDb_ = 0.0F;
                equalizerHeadroomCountdown_ = 0;
            } else if (coefficientsChanged && equalizerHeadroomCountdown_ <= 0) {
                equalizerMaximumBoostDb_ = 0.0F;
                for (std::size_t point = 0; point < kEqualizerBandCount * 2U - 1U; ++point) {
                    const double frequency = point % 2U == 0U
                        ? kEqFrequenciesHz[point / 2U]
                        : std::sqrt(
                            kEqFrequenciesHz[point / 2U] *
                            kEqFrequenciesHz[point / 2U + 1U]);
                    double magnitude = 1.0;
                    for (const auto& band : equalizerBands_) {
                        magnitude *= band.magnitude(sampleRate_, frequency);
                    }
                    equalizerMaximumBoostDb_ = std::max(
                        equalizerMaximumBoostDb_,
                        static_cast<float>(20.0 * std::log10(std::max(magnitude, 1.0e-12))));
                }
                equalizerHeadroomCountdown_ = kEqHeadroomIntervalFrames;
            } else {
                equalizerHeadroomCountdown_ -= kEqCoefficientIntervalFrames;
            }
            const float targetPreampDb = activeEqualizerBands_ != 0U
                ? -std::max(
                    0.0F,
                    equalizerMaximumBoostDb_ - kEqualizerPreLimiterBoostDb)
                : 0.0F;
            const float preampDelta = targetPreampDb - currentPreampDb_;
            // pow() is relatively expensive on 32-bit ARM. Once the smooth
            // transition has converged, retain the exact gain instead of
            // recomputing the same value hundreds of times per second.
            if (preampDelta != 0.0F) {
                currentPreampDb_ = std::abs(preampDelta) < 0.00001F
                    ? targetPreampDb
                    : currentPreampDb_ + preampDelta * equalizerGainSmoothing_;
                currentPreampGain_ = std::pow(10.0F, currentPreampDb_ / 20.0F);
            }
            // Per-stage clarity trims ease with the same refresh interval
            // and smoothing factor as the equalizer, so trim and preset
            // moves crossfade instead of clicking. Neutral trims never
            // trigger a rebuild, leaving every coefficient untouched.
            for (std::size_t stage = 0; stage < kClarityTrimCount; ++stage) {
                const float trimTarget =
                    targetClarityTrimsDb_[stage].load(std::memory_order_acquire);
                float& trimCurrent = currentClarityTrimsDb_[stage];
                trimCurrent += (trimTarget - trimCurrent) * equalizerGainSmoothing_;
                if (std::abs(trimTarget - trimCurrent) < 0.0005F) {
                    trimCurrent = trimTarget;
                }
                if (trimCurrent != appliedClarityTrimsDb_[stage]) {
                    appliedClarityTrimsDb_[stage] = trimCurrent;
                    applyClarityTrim(stage, trimCurrent);
                }
            }
            equalizerUpdateCountdown_ = kEqCoefficientIntervalFrames - 1;
        }

        const std::size_t offset = static_cast<std::size_t>(frame) *
            static_cast<std::size_t>(channelCount);
        // One-pole DC blocker ahead of all gain staging: a stream DC offset
        // asymmetrically consumes peak headroom and clicks at boundaries.
        const double dcInputLeft = samples[offset];
        const double dcOutputLeft =
            dcInputLeft - dcXPrev_[0] + dcBlockerR_ * dcYPrev_[0];
        dcXPrev_[0] = dcInputLeft;
        dcYPrev_[0] = dcOutputLeft;
        float equalizedLeft = static_cast<float>(dcOutputLeft) * currentPreampGain_;
        float equalizedRight;
        if (channelCount == 2) {
            const double dcInputRight = samples[offset + 1U];
            const double dcOutputRight =
                dcInputRight - dcXPrev_[1] + dcBlockerR_ * dcYPrev_[1];
            dcXPrev_[1] = dcInputRight;
            dcYPrev_[1] = dcOutputRight;
            equalizedRight = static_cast<float>(dcOutputRight) * currentPreampGain_;
        } else {
            equalizedRight = equalizedLeft;
        }
        if (activeEqualizerBands_ != 0U) {
            for (std::size_t band = 0; band < kEqualizerBandCount; ++band) {
                if ((activeEqualizerBands_ & static_cast<std::uint16_t>(1U << band)) == 0U) {
                    continue;
                }
                equalizedLeft = equalizerBands_[band].tick(equalizedLeft, 0);
                if (channelCount == 2) {
                    equalizedRight = equalizerBands_[band].tick(equalizedRight, 1);
                }
            }
            if (channelCount == 1) equalizedRight = equalizedLeft;
        }

        const float dryLeft = equalizedLeft;
        const float dryRight = equalizedRight;

        if (djEnabled) {
            // Analyze the CURRENT (future-to-the-listener) frame while the
            // listener hears PCM delayed by three seconds below. This turns
            // a detected impact at source time T into an exact pre-drop that
            // begins at audible time T-3s.
            const float mid = channelCount == 2 ? (dryLeft + dryRight) * 0.5F : dryLeft;
            const float side = channelCount == 2 ? (dryLeft - dryRight) * 0.5F : 0.0F;
            djBassState_ += djBassAlpha_ * (mid - djBassState_);
            djVocalLowState_ += djVocalLowAlpha_ * (mid - djVocalLowState_);
            const float vocalBand = djVocalLowState_ - djBassState_;
            const float fullPower = channelCount == 2
                ? 0.5F * (dryLeft * dryLeft + dryRight * dryRight)
                : dryLeft * dryLeft;
            const float vocalPower = vocalBand * vocalBand;
            const float sidePower = side * side;
            djFullEnergy_ += djEnvelopeAlpha_ * (fullPower - djFullEnergy_);
            djVocalEnergy_ += djEnvelopeAlpha_ * (vocalPower - djVocalEnergy_);
            djSideEnergy_ += djEnvelopeAlpha_ * (sidePower - djSideEnergy_);
            djBaselineEnergy_ += djBaselineAlpha_ * (fullPower - djBaselineEnergy_);

            if (djTriggerCooldownFrames_ > 0) --djTriggerCooldownFrames_;

            if (--djControlCountdown_ <= 0) {
                constexpr float epsilon = 1.0e-10F;
                const float total = std::max(djFullEnergy_, epsilon);
                const float baseline = std::max(djBaselineEnergy_, epsilon);
                const float vocalRatio = std::clamp(djVocalEnergy_ / total, 0.0F, 1.5F);
                const float centerRatio = djVocalEnergy_ /
                    std::max(djVocalEnergy_ + 0.85F * djSideEnergy_, epsilon);
                const float bandScore = std::clamp((vocalRatio - 0.08F) / 0.42F, 0.0F, 1.0F);
                const float centerScore = std::clamp((centerRatio - 0.52F) / 0.38F, 0.0F, 1.0F);
                const float vocalProbability = std::clamp(
                    bandScore * (0.30F + 0.70F * centerScore), 0.0F, 1.0F);
                const float currentDb = 10.0F * std::log10(total);
                const float baselineDb = 10.0F * std::log10(baseline);
                const float surgeDb = currentDb - baselineDb;

                const bool delayPrimed =
                    djLookAheadFramesStored_ >= djLookAheadCapacityFrames_;
                const bool strongEnergyImpact =
                    surgeDb >= kDjStrongSurgeDb && currentDb > -24.0F;
                const bool vocalImpact =
                    vocalProbability >= 0.45F &&
                    surgeDb >= kDjLoudSurgeDb &&
                    currentDb > -20.0F;
                const bool veryLoudImpact =
                    surgeDb >= 1.5F && currentDb > -8.0F;

                if (delayPrimed &&
                    djTriggerCooldownFrames_ <= 0 &&
                    djPreDropFramesRemaining_ <= 0 &&
                    (strongEnergyImpact || vocalImpact || veryLoudImpact)) {
                    // Because output is delayed by exactly this many frames,
                    // starting the envelope NOW means the listener hears:
                    //   first second  -> 70% gain  (30% reduction)
                    //   second second -> 40% gain  (60% reduction)
                    //   third second  -> 10% gain  (90% reduction)
                    // and the source impact itself returns to 100%.
                    djPreDropFramesRemaining_ =
                        static_cast<std::int64_t>(djLookAheadCapacityFrames_);
                    djTriggerCooldownFrames_ = static_cast<std::int64_t>(
                        std::llround(sampleRate_ * kDjTriggerCooldownSeconds));
                }

                djControlCountdown_ = kDjControlIntervalFrames;
            }
        } else {
            djControlCountdown_ = 0;
            djPreDropFramesRemaining_ = 0;
            djTriggerCooldownFrames_ = 0;
            djAppliedDropGain_ = 1.0F;
        }

        float outputLeft = dryLeft;
        float outputRight = dryRight;
        if (clarityChainActive_) {
            // Effective wet amount: enable crossfade times the clarity mix.
            // At the default mix of 1.0 this equals currentWet_ exactly.
            const float clarityMix = currentWet_ * currentClarityWet_;
            float wetLeft = subBassHighPass_.tick(dryLeft, 0) * clarityTrimLinear_[0];
            float wetRight = channelCount == 2
                ? subBassHighPass_.tick(dryRight, 1) * clarityTrimLinear_[0]
                : wetLeft;
            wetLeft = bassFoundation_.tick(wetLeft, 0);
            wetRight = channelCount == 2
                ? bassFoundation_.tick(wetRight, 1)
                : wetLeft;
            wetLeft = lowMidSeparation_.tick(wetLeft, 0);
            wetRight = channelCount == 2
                ? lowMidSeparation_.tick(wetRight, 1)
                : wetLeft;
            wetLeft = boxinessControl_.tick(wetLeft, 0);
            wetRight = channelCount == 2
                ? boxinessControl_.tick(wetRight, 1)
                : wetLeft;
            wetLeft = presenceDetail_.tick(wetLeft, 0);
            wetRight = channelCount == 2
                ? presenceDetail_.tick(wetRight, 1)
                : wetLeft;
            wetLeft = airDetail_.tick(wetLeft, 0);
            wetRight = channelCount == 2
                ? airDetail_.tick(wetRight, 1)
                : wetLeft;

            // Harmonic Air Exciter: extracts highs above 6 kHz and generates silky tape-style sheen
            const float exciterInLeft = airExciterFilter_.tick(dryLeft, 0);
            const float exciterInRight = channelCount == 2
                ? airExciterFilter_.tick(dryRight, 1)
                : exciterInLeft;
            const float excitedLeft = exciterInLeft - (exciterInLeft * exciterInLeft * exciterInLeft * 0.25F);
            const float excitedRight = exciterInRight - (exciterInRight * exciterInRight * exciterInRight * 0.25F);
            wetLeft += excitedLeft * clarityExciterAmount_;
            wetRight += excitedRight * clarityExciterAmount_;

            if (channelCount == 2) {
                const float mid = (wetLeft + wetRight) * 0.5F;
                const float rawSide = (wetLeft - wetRight) * 0.5F;
                // Mono-Bass (Anti-Blur): pass side through 130 Hz highpass so bass stays centered mono
                const float sideHigh = monoBassFilter_.tick(rawSide, 0) * clarityTrimLinear_[6];
                const float wideSide = sideHigh * kClarityStereoWidth;
                wetLeft = mid + wideSide;
                wetRight = mid - wideSide;
            }
            wetLeft *= kClarityMakeupGain;
            wetRight *= kClarityMakeupGain;
            // Headphone crossfeed is intentionally not applied globally: on
            // phone speakers and some OEM spatializers it can create phasey,
            // device-dependent coloration that listeners report as distortion.
            outputLeft += (wetLeft - dryLeft) * clarityMix;
            outputRight += (wetRight - dryRight) * clarityMix;
        }

        if (djActive || highlightEnabled) {
            if (djCountdown_-- <= 0) {
                // 30 ms exponential smoothing, independent of buffer size/rate.
                const float blend = static_cast<float>(1.0 - std::exp(-128.0 / (sampleRate_ * 0.03)));
                auto ease = [blend](float& value, float goal) {
                    value += (goal - value) * blend;
                    if (std::abs(goal - value) < 0.00001F) value = goal;
                };
                ease(djEnergy_, highlightEnabled ? highlightEnergy * highlight.boost : djEnergyTarget_.load());
                ease(djVocals_, highlightEnabled ? highlightVocals * highlight.boost : djVocalsTarget_.load());
                ease(djBeats_, highlightEnabled ? highlightBeats * highlight.boost : djBeatsTarget_.load());
                djEnergyGain_ = std::pow(10.0F, djEnergy_ / 20.0F);
                djVocalBand_.setPeaking(sampleRate_, std::min(2200.0, sampleRate_ * 0.3), 0.7, djVocals_);
                djBeatBand_.setPeaking(sampleRate_, 90.0, 0.7, djBeats_);
                djCountdown_ = 127;
            }
            const float step = static_cast<float>(1.0 / (sampleRate_ * 0.03));
            const float volumeGoal = highlightEnabled ? highlight.volume : djVolumeTarget_.load();
            djVolume_ += std::clamp(volumeGoal - djVolume_, -step, step);
            outputLeft = djBeatBand_.tick(djVocalBand_.tick(outputLeft, 0), 0) * djVolume_ * djEnergyGain_;
            if (channelCount == 2) {
                outputRight = djBeatBand_.tick(djVocalBand_.tick(outputRight, 1), 1) * djVolume_ * djEnergyGain_;
            } else outputRight = outputLeft;
        }

        // Analog soft-knee saturation: provides clean headroom without squashing the track
        auto softSaturate = [](float x) noexcept -> float {
            const float absX = std::abs(x);
            if (absX <= kSoftKneeThreshold) return x;
            constexpr float range = kOutputCeiling - kSoftKneeThreshold;
            const float excess = absX - kSoftKneeThreshold;
            const float ratio = std::tanh(excess / range);
            const float saturated = kSoftKneeThreshold + range * ratio;
            return x >= 0.0F ? saturated : -saturated;
        };

        const float peak = std::max(std::abs(outputLeft), std::abs(outputRight));
        // Envelope limiter for extreme overloads (> 1.25 peak), preserving dynamic punch
        constexpr float kLimiterEngageThreshold = 1.25F;
        const float requiredLimiterGain = frameProtectionRequired && peak > kLimiterEngageThreshold
            ? kLimiterEngageThreshold / peak
            : 1.0F;
        if (requiredLimiterGain < limiterGain_) {
            limiterGain_ = requiredLimiterGain;
        } else {
            limiterGain_ += (1.0F - limiterGain_) * limiterRelease_;
            if (1.0F - limiterGain_ < 0.00001F) limiterGain_ = 1.0F;
        }
        float finalGain = limiterGain_;
        if (microFadePosition_ < microFadeFrameCount_) {
            const double phase = kPi * static_cast<double>(microFadePosition_ + 1) /
                static_cast<double>(microFadeFrameCount_);
            finalGain *= static_cast<float>(0.5 * (1.0 - std::cos(phase)));
            ++microFadePosition_;
        }
        outputLeft *= finalGain;
        outputRight *= finalGain;
        if (frameProtectionRequired) {
            outputLeft = softSaturate(outputLeft);
            outputRight = softSaturate(outputRight);
        }
        outputLeft = std::isfinite(outputLeft)
            ? std::clamp(outputLeft, -kOutputCeiling, kOutputCeiling)
            : 0.0F;
        outputRight = std::isfinite(outputRight)
            ? std::clamp(outputRight, -kOutputCeiling, kOutputCeiling)
            : 0.0F;
        if (djEnabled) {
            if (djLookAheadChannelCount_ != channelCount) {
                djLookAheadReadFrame_ = 0;
                djLookAheadWriteFrame_ = 0;
                djLookAheadFramesStored_ = 0;
                djLookAheadChannelCount_ = channelCount;
                djPreDropFramesRemaining_ = 0;
                djAppliedDropGain_ = 1.0F;
                std::fill_n(
                    djLookAheadBuffer_.get(),
                    djLookAheadCapacityFrames_ * 2U,
                    0.0F);
            }

            float audibleLeft = 0.0F;
            float audibleRight = 0.0F;
            if (djLookAheadFramesStored_ >= djLookAheadCapacityFrames_) {
                const std::size_t readOffset = djLookAheadReadFrame_ * 2U;
                audibleLeft = djLookAheadBuffer_[readOffset];
                audibleRight = djLookAheadBuffer_[readOffset + 1U];
                djLookAheadReadFrame_ =
                    (djLookAheadReadFrame_ + 1U) % djLookAheadCapacityFrames_;
                --djLookAheadFramesStored_;
            }

            const std::size_t writeOffset = djLookAheadWriteFrame_ * 2U;
            djLookAheadBuffer_[writeOffset] = outputLeft;
            djLookAheadBuffer_[writeOffset + 1U] =
                channelCount == 2 ? outputRight : outputLeft;
            djLookAheadWriteFrame_ =
                (djLookAheadWriteFrame_ + 1U) % djLookAheadCapacityFrames_;
            ++djLookAheadFramesStored_;

            const float stagedGain = nextDjPreDropGain();
            samples[offset] = audibleLeft * stagedGain;
            if (channelCount == 2) {
                samples[offset + 1U] = audibleRight * stagedGain;
            }
        } else {
            // Turning the feature off is immediate and never leaks stale
            // delayed PCM into normal playback.
            if (djLookAheadFramesStored_ != 0U) {
                djLookAheadReadFrame_ = 0;
                djLookAheadWriteFrame_ = 0;
                djLookAheadFramesStored_ = 0;
                djLookAheadChannelCount_ = 0;
            }
            samples[offset] = outputLeft;
            if (channelCount == 2) samples[offset + 1U] = outputRight;
        }
    }

    if (target == 0.0F && currentWet_ == 0.0F && clarityChainActive_) {
        // Once bypass has fully crossfaded, stop burning CPU on a result that
        // is multiplied by zero. The next enable starts from clean state.
        subBassHighPass_.clear();
        bassFoundation_.clear();
        lowMidSeparation_.clear();
        boxinessControl_.clear();
        presenceDetail_.clear();
        airDetail_.clear();
        crossfeed_.clear();
        clarityChainActive_ = false;
    }
}

DspProcessor::Biquad DspProcessor::Biquad::highPass(
    double sampleRate,
    double frequency,
    double q) noexcept {
    Biquad filter;
    const double omega = 2.0 * kPi * safeFrequency(sampleRate, frequency) / sampleRate;
    const double cosine = std::cos(omega);
    const double alpha = std::sin(omega) / (2.0 * std::max(q, 0.01));
    const double a0 = 1.0 + alpha;
    filter.b0 = ((1.0 + cosine) * 0.5) / a0;
    filter.b1 = -(1.0 + cosine) / a0;
    filter.b2 = filter.b0;
    filter.a1 = (-2.0 * cosine) / a0;
    filter.a2 = (1.0 - alpha) / a0;
    return filter;
}

DspProcessor::Biquad DspProcessor::Biquad::peaking(
    double sampleRate,
    double frequency,
    double q,
    double gainDb) noexcept {
    Biquad filter;
    const double omega = 2.0 * kPi * safeFrequency(sampleRate, frequency) / sampleRate;
    const double cosine = std::cos(omega);
    const double alpha = std::sin(omega) / (2.0 * std::max(q, 0.01));
    const double amplitude = std::pow(10.0, gainDb / 40.0);
    const double a0 = 1.0 + alpha / amplitude;
    filter.b0 = (1.0 + alpha * amplitude) / a0;
    filter.b1 = (-2.0 * cosine) / a0;
    filter.b2 = (1.0 - alpha * amplitude) / a0;
    filter.a1 = filter.b1;
    filter.a2 = (1.0 - alpha / amplitude) / a0;
    return filter;
}

DspProcessor::Biquad DspProcessor::Biquad::highShelf(
    double sampleRate,
    double frequency,
    double slope,
    double gainDb) noexcept {
    Biquad filter;
    const double omega = 2.0 * kPi * safeFrequency(sampleRate, frequency) / sampleRate;
    const double cosine = std::cos(omega);
    const double sine = std::sin(omega);
    const double amplitude = std::pow(10.0, gainDb / 40.0);
    const double safeSlope = std::clamp(slope, 0.1, 1.0);
    const double alpha = (sine * 0.5) * std::sqrt(
        (amplitude + 1.0 / amplitude) * (1.0 / safeSlope - 1.0) + 2.0);
    const double beta = 2.0 * std::sqrt(amplitude) * alpha;
    const double a0 =
        (amplitude + 1.0) - (amplitude - 1.0) * cosine + beta;
    filter.b0 = amplitude *
        ((amplitude + 1.0) + (amplitude - 1.0) * cosine + beta) / a0;
    filter.b1 = -2.0 * amplitude *
        ((amplitude - 1.0) + (amplitude + 1.0) * cosine) / a0;
    filter.b2 = amplitude *
        ((amplitude + 1.0) + (amplitude - 1.0) * cosine - beta) / a0;
    filter.a1 = 2.0 *
        ((amplitude - 1.0) - (amplitude + 1.0) * cosine) / a0;
    filter.a2 =
        ((amplitude + 1.0) - (amplitude - 1.0) * cosine - beta) / a0;
    return filter;
}

void DspProcessor::Biquad::setPeaking(
    double sampleRate,
    double frequency,
    double q,
    double gainDb) noexcept {
    const Biquad coefficients = peaking(sampleRate, frequency, q, gainDb);
    b0 = coefficients.b0;
    b1 = coefficients.b1;
    b2 = coefficients.b2;
    a1 = coefficients.a1;
    a2 = coefficients.a2;
}

void DspProcessor::Biquad::setHighShelf(
    double sampleRate,
    double frequency,
    double slope,
    double gainDb) noexcept {
    const Biquad coefficients = highShelf(sampleRate, frequency, slope, gainDb);
    b0 = coefficients.b0;
    b1 = coefficients.b1;
    b2 = coefficients.b2;
    a1 = coefficients.a1;
    a2 = coefficients.a2;
}

double DspProcessor::Biquad::magnitude(double sampleRate, double frequency) const noexcept {
    const double omega = 2.0 * kPi * safeFrequency(sampleRate, frequency) / sampleRate;
    const double cosine = std::cos(omega);
    const double sine = std::sin(omega);
    const double cosine2 = std::cos(2.0 * omega);
    const double sine2 = std::sin(2.0 * omega);
    const double numeratorReal = b0 + b1 * cosine + b2 * cosine2;
    const double numeratorImaginary = -b1 * sine - b2 * sine2;
    const double denominatorReal = 1.0 + a1 * cosine + a2 * cosine2;
    const double denominatorImaginary = -a1 * sine - a2 * sine2;
    const double numeratorPower = numeratorReal * numeratorReal +
        numeratorImaginary * numeratorImaginary;
    const double denominatorPower = denominatorReal * denominatorReal +
        denominatorImaginary * denominatorImaginary;
    return std::sqrt(numeratorPower / std::max(denominatorPower, 1.0e-24));
}

void DspProcessor::Crossfeed::configure(
    double sampleRate,
    double cutoffHz,
    double levelDb) noexcept {
    // Reference BS2B topology: complementary single-pole low-pass crossfeed
    // and high-boost direct path. 700 Hz / 4.5 dB is Bauer's default profile.
    const double frequencyLow = safeFrequency(sampleRate, cutoffHz);
    const double feedLevel = std::abs(levelDb);
    const double gainDbLow = feedLevel * (-5.0 / 6.0) - 3.0;
    const double gainDbHigh = feedLevel / 6.0 - 3.0;
    const double gainLow = std::pow(10.0, gainDbLow / 20.0);
    const double gainHigh = 1.0 - std::pow(10.0, gainDbHigh / 20.0);
    const double frequencyHigh = frequencyLow * std::pow(
        2.0,
        (gainDbLow - 20.0 * std::log10(gainHigh)) / 12.0);

    const double xLow = std::exp(-2.0 * kPi * frequencyLow / sampleRate);
    b1Low = xLow;
    a0Low = gainLow * (1.0 - xLow);

    const double xHigh = std::exp(
        -2.0 * kPi * safeFrequency(sampleRate, frequencyHigh) / sampleRate);
    b1High = xHigh;
    a0High = 1.0 - gainHigh * (1.0 - xHigh);
    a1High = -xHigh;
    gain = 1.0 / (1.0 - gainHigh + gainLow);
    clear();
}

}  // namespace lastwave::audio
