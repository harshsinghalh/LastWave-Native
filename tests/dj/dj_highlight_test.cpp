#include "DspProcessor.h"
#include "DjHighlightDetector.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <vector>
using lastwave::audio::DjHighlightDetector;
using lastwave::audio::DspProcessor;
constexpr double pi = 3.141592653589793;

int main() {
    int checks = 0;
    for (const int rate : {44100, 48000, 96000}) {
        DjHighlightDetector detector;
        detector.configure(rate);
        std::int64_t frame = 0;
        auto feed = [&](double seconds, float amplitude, double hz, int focus = 0, int spacing = 0) {
            auto mix = DjHighlightDetector::Mix{};
            for (int n = 0; n < static_cast<int>(seconds * rate); ++n, ++frame) {
                const float x = amplitude * std::sin(frame * hz * 2 * pi / rate);
                mix = detector.tick(x, x, focus, spacing);
                assert(std::isfinite(mix.volume) && std::isfinite(mix.boost));
            }
            return mix;
        };
        feed(12, .03F, 90); assert(detector.eventCount() == 0); ++checks;
        auto mix = feed(2, .18F, 90);
        assert(detector.eventCount() == 1 && mix.volume == .8F && mix.boost == 1); ++checks;
        mix = feed(60, .18F, 90);
        assert(detector.eventCount() == 1 && mix.volume == 1 && mix.boost == 0); ++checks;
        detector.reset(); frame = 0;
        feed(12, .001F, 90); feed(10, .01F, 90);
        assert(detector.eventCount() == 0); ++checks;
        detector.reset(); frame = 0;
        feed(12, .03F, 90); feed(.002, 1.0F, 90); feed(5, .03F, 90);
        assert(detector.eventCount() == 0); ++checks;
        for (int focus : {1, 2}) for (double hz : {90.0, 2200.0}) {
            detector.reset(); frame = 0;
            feed(12, .03F, hz, focus); feed(5, .18F, hz, focus);
            assert(detector.eventCount() == ((focus == 1 && hz == 90) || (focus == 2 && hz == 2200) ? 1 : 0));
            ++checks;
        }
        for (int spacing : {0, 1}) {
            detector.reset(); frame = 0;
            std::vector<std::int64_t> starts;
            std::int64_t count = 0, started = -1;
            float low = 1;
            for (; frame < rate * 130LL; ++frame) {
                const double seconds = static_cast<double>(frame) / rate;
                const bool surge = seconds >= 12 && std::fmod(seconds - 12, 10) < 2;
                const float x = (surge ? .18F : .03F) * std::sin(frame * 90.0 * 2 * pi / rate);
                mix = detector.tick(x, x, 0, spacing);
                if (detector.eventCount() != count) {
                    count = detector.eventCount(); starts.push_back(frame); started = frame; low = 1;
                }
                if (started >= 0) {
                    const double elapsed = static_cast<double>(frame - started) / rate;
                    low = std::min(low, mix.volume);
                    if (frame - started == static_cast<std::int64_t>(rate * 1.5)) {
                        assert(std::abs(low - .7F) < .00001F);
                        assert(mix.volume == .8F && mix.boost == 1); ++checks;
                    }
                    if (elapsed > 5.01) assert(mix.volume == 1 && mix.boost == 0);
                }
            }
            assert(starts.size() >= 2 && starts.size() <= (spacing == 0 ? 4U : 2U));
            for (std::size_t n = 1; n < starts.size(); ++n)
                assert(starts[n] - starts[n-1] >= rate * (spacing == 0 ? 35LL : 60LL));
            ++checks;
        }
        detector.reset(); frame = 0;
        detector.tick(std::numeric_limits<float>::quiet_NaN(), INFINITY, 0, 0);
        feed(12, .03F, 90); feed(5, .18F, 90);
        assert(detector.eventCount() == 1); ++checks;
    }
    // Process the actual production DSP at several block sizes. Selection must
    // not depend on decoder buffer boundaries or reduce ordinary loud PCM.
    for (int channels : {1, 2}) for (int block : {127, 1024, 4096}) {
        DspProcessor dsp; dsp.configure(48000); dsp.setLongLookAheadMode(true);
        dsp.setDjHighlights(true, 0, 0, 2, 2, 3);
        bool changed = false;
        for (int offset = 0; offset < 48000 * 23; offset += block) {
            const int frames = std::min(block, 48000 * 23 - offset);
            std::vector<float> dry(frames * channels);
            for (int n = 0; n < frames; ++n) for (int c = 0; c < channels; ++c)
                dry[n * channels + c] = (offset + n < 48000 * 12 ? .03F : .18F) *
                    std::sin((offset + n) * 90.0 * 2 * pi / 48000);
            auto wet = dry;
            dsp.process(wet.data(), frames, channels);
            if (offset + frames <= 48000 * 12 || offset >= 48000 * 20) assert(wet == dry);
            else if (wet != dry) changed = true;
            for (float x : wet) assert(std::isfinite(x) && std::abs(x) <= 1);
        }
        assert(changed); ++checks;
        auto input = std::vector<float>(channels * 48000, .99F); auto output = input;
        dsp.setBitPerfect(true); dsp.process(output.data(), 48000, channels);
        assert(output == input); ++checks;
        dsp.setBitPerfect(false); dsp.setDjHighlights(false, 0, 0, 2, 2, 3);
        output = input; dsp.process(output.data(), 48000, channels); assert(output == input); ++checks;
    }
    std::cout << checks << " selective highlight checks passed\n";
}
