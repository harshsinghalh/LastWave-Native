#include "DjHighlightDetector.h"
#include "DspProcessor.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>
using lastwave::audio::DjHighlightDetector;
using lastwave::audio::DspProcessor;
constexpr double pi = 3.141592653589793;

int main() {
    int checks = 0;
    for (int rate : {44100, 48000, 96000}) {
        DjHighlightDetector detector; detector.configure(rate);
        std::int64_t frame = 0;
        auto feed = [&](double seconds, float amplitude, bool approved = false) {
            DjHighlightDetector::Mix mix;
            for (int n = 0; n < static_cast<int>(seconds * rate); ++n, ++frame) {
                const float x = amplitude * std::sin(frame * 90.0 * 2 * pi / rate);
                mix = detector.tick(x, x, 0, 0, true, approved);
            }
            return mix;
        };
        feed(12, .03F);
        auto pending = feed(.5, .18F);
        assert(detector.features()[6] == 1 && detector.eventCount() == 0);
        assert(pending.volume == 1 && pending.boost == 0); ++checks;
        feed(1, .18F); assert(detector.eventCount() == 0); ++checks;
        auto accepted = feed(2, .18F, true);
        assert(detector.eventCount() == 1 && accepted.volume == .8F && accepted.boost == 1); ++checks;
        accepted = feed(4, .18F, true);
        assert(accepted.volume == 1 && accepted.boost == 0 && detector.eventCount() == 1); ++checks;
        const int generation = detector.generation(); detector.reset(); frame = 0;
        assert(detector.generation() != generation && detector.features()[6] == 0); ++checks;
        feed(12, .03F); feed(.5, .18F); feed(6, .18F);
        assert(detector.features()[6] == 0 && detector.eventCount() == 0); ++checks;
        feed(1, .18F, true); assert(detector.eventCount() == 0); ++checks;
        detector.reset(); frame = 0;
        feed(12, .03F); feed(.5, .18F); feed(.2, .001F); feed(1, .001F, true);
        assert(detector.eventCount() == 0 && detector.features()[6] == 0); ++checks;
    }
    for (int channels : {1, 2}) {
        DspProcessor dsp; dsp.configure(48000); dsp.setLongLookAheadMode(true);
        dsp.setDjEnergyProgramManaged(true); dsp.setDjEnergyEnabled(true);
        dsp.setDjHighlights(true, 0, 0, 2, 2, 3); dsp.setDjLayaMode(true);
        std::int64_t frame = 0;
        auto feed = [&](double seconds, float amplitude) {
            bool changed = false;
            for (int offset = 0; offset < static_cast<int>(seconds * 48000); offset += 480) {
                std::vector<float> input(480 * channels);
                for (int n = 0; n < 480; ++n, ++frame) for (int c = 0; c < channels; ++c)
                    input[n * channels + c] = amplitude * std::sin(frame * 90.0 * 2 * pi / 48000);
                auto output = input; dsp.process(output.data(), 480, channels);
                changed |= output != input;
                for (float x : output) assert(std::isfinite(x) && std::abs(x) <= 1);
            }
            return changed;
        };
        assert(!feed(12, .03F)); assert(!feed(.5, .18F)); ++checks;
        const auto candidate = dsp.djFeatures(); assert(candidate[6] == 1); ++checks;
        const int generation = static_cast<int>(candidate[4]), id = static_cast<int>(candidate[5]);
        dsp.setDjLayaDecision(generation - 1, id, true); assert(!feed(.1, .18F)); ++checks;
        dsp.setDjLayaDecision(generation, id - 1, true); assert(!feed(.1, .18F)); ++checks;
        dsp.setDjLayaDecision(generation, id, false); assert(!feed(.1, .18F)); ++checks;
        dsp.setDjLayaDecision(generation, id, true); assert(feed(2, .18F)); ++checks;
        feed(5, .18F); assert(!feed(1, .18F)); ++checks;
        dsp.setBitPerfect(true); assert(!feed(1, .9F)); assert(dsp.djFeatures()[6] == 0); ++checks;
        dsp.setBitPerfect(false); dsp.setDjHighlights(false, 0, 0, 2, 2, 3);
        assert(!feed(1, .9F)); ++checks;
        dsp.setDjEnergyEnabled(false);
        dsp.setDjHighlights(true, 0, 0, 2, 2, 3);
        dsp.setDjLayaDecision(generation, id, true);
        assert(!feed(1, .9F)); assert(dsp.djFeatures()[6] == 0); ++checks;
        dsp.setDjHighlights(false, 0, 0, 2, 2, 3);
        dsp.setDjCue(.7F, 2, 2, 3);
        assert(!feed(1, .3F)); ++checks;
        dsp.setDjEnergyEnabled(true); assert(feed(1, .3F)); ++checks;
        dsp.setDjEnergyEnabled(false); feed(1, .3F);
        assert(!feed(1, .3F)); ++checks;
    }
    std::cout << checks << " Laya approval / playback checks passed\n";
}
