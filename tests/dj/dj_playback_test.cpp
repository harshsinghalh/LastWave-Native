#include "DspProcessor.h"
#include "DjHighlightDetector.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>
using lastwave::audio::DspProcessor;
using lastwave::audio::DjHighlightDetector;
constexpr double pi = 3.141592653589793;

int main() {
    int checks = 0;
    for (int rate : {44100, 48000, 96000}) {
        DjHighlightDetector detector;
        detector.configure(rate);
        for (int n = 0; n < rate * 80; ++n) {
            const float x = .3F * std::sin(n * 90.0 * 2 * pi / rate);
            const auto mix = detector.tick(x, x, 0, 0);
            if (n < rate * 10) assert(mix.volume == 1);
            if (n > rate * 20) assert(mix.volume == 1);
        }
        assert(detector.eventCount() == 1); ++checks;

        DspProcessor dsp;
        dsp.configure(rate); dsp.setLongLookAheadMode(true);
        dsp.setDjEnergyProgramManaged(true); dsp.setDjEnergyEnabled(true);
        dsp.setDjHighlights(false, 0, 0, 0, 0, 0, .7F, .8F, 1.5F);
        dsp.setDjTimedMode(true, 165);
        auto process = [&](double seconds) {
            std::vector<float> pcm(static_cast<int>(seconds * rate) * 2);
            for (std::size_t n = 0; n < pcm.size() / 2; ++n) {
                pcm[n * 2] = pcm[n * 2 + 1] = .1F * std::sin(n * 440.0 * 2 * pi / rate);
            }
            dsp.process(pcm.data(), static_cast<int>(pcm.size() / 2), 2);
            for (float value : pcm) assert(std::isfinite(value) && std::abs(value) <= 1);
            return dsp.djRuntime();
        };
        dsp.setDjMediaTimeUs(164'000'000);
        auto state = process(.5);
        assert(std::abs(state[1] - .7F) < .0001F); ++checks;
        dsp.setDjMediaTimeUs(165'000'000);
        state = process(.75);
        assert(std::abs(state[1] - .75F) < .0001F); ++checks;
        state = process(.75);
        assert(std::abs(state[1] - .8F) < .0001F); ++checks;
        // A decoded seek backwards immediately restores the pre-cue mix.
        dsp.setDjMediaTimeUs(20'000'000);
        state = process(.1);
        assert(std::abs(state[1] - .7F) < .0001F); ++checks;
        dsp.setDjTimedMode(false, 165);
        process(.1);
        dsp.previewDjEnergy(.4F, .8F, 1.5F, 0, 0, 0);
        state = process(.5);
        assert(std::abs(state[1] - .4F) < .0001F && state[6] == 1); ++checks;
        state = process(.78);
        assert(std::abs(state[1] - .6F) < .0001F); ++checks;
        state = process(.75);
        assert(std::abs(state[1] - .8F) < .0001F); ++checks;
        state = process(4);
        assert(state[1] == 1 && state[6] == 0); ++checks;
        dsp.previewDjEnergy(.4F, .8F, 1.5F, 2, 2, 3);
        process(.5);
        dsp.setDjEnergyEnabled(false);
        state = process(.2);
        assert(state[1] == 1 && state[6] == 0); ++checks;
        dsp.previewDjEnergy(.4F, .8F, 1.5F, 2, 2, 3);
        dsp.setBitPerfect(true);
        state = process(.2);
        assert(state[1] == 1 && state[6] == 0); ++checks;
    }
    std::cout << checks << " production timing / preview checks passed\n";
}
