#include "DjHighlightDetector.h"
#include <cassert>
#include <cmath>
#include <iostream>
using lastwave::audio::DjHighlightDetector;

int main() {
    constexpr double pi = 3.141592653589793;
    int checks = 0;
    for (int rate : {44100, 48000, 96000}) {
        for (bool custom : {false, true}) {
            DjHighlightDetector detector;
            detector.configure(rate);
            const float before = custom ? .4F : .7F;
            const float after = custom ? .6F : .8F;
            const float ramp = custom ? 3.F : 1.5F;
            std::int64_t frame = 0;
            auto tick = [&](float amplitude, bool accepted) {
                const float x = amplitude * std::sin(frame++ * 90.0 * 2 * pi / rate);
                return detector.tick(x, x, 0, 0, true, accepted, before, after, ramp);
            };
            for (int n = 0; n < 12 * rate; ++n) tick(.03F, false);
            for (int n = 0; n < rate / 2; ++n) tick(.18F, false);
            assert(detector.features()[6] == 1 && detector.eventCount() == 0); ++checks;
            const auto start = tick(.18F, true);
            assert(start.volume == 1 && start.boost == 0 && detector.eventCount() == 1); ++checks;
            for (int n = 1; n <= static_cast<int>((ramp + 3.5) * rate); ++n) {
                const auto mix = tick(.18F, true);
                assert(std::isfinite(mix.volume) && mix.volume >= before && mix.volume <= 1);
                if (n == std::lround(.03 * rate)) {
                    assert(std::abs(mix.volume - before) < .00001F); ++checks;
                }
                if (n == std::lround((ramp + .03) * .5 * rate)) {
                    assert(std::abs(mix.volume - (before + after) * .5F) < .00001F); ++checks;
                }
                if (n == std::lround(ramp * rate)) {
                    assert(mix.volume == after && mix.boost == 1); ++checks;
                }
                if (n == std::lround((ramp + 3.25) * rate)) {
                    assert(std::abs(mix.volume - (after + 1) * .5F) < .00001F); ++checks;
                }
                if (n == std::lround((ramp + 3.5) * rate)) {
                    assert(mix.volume == 1 && mix.boost == 0); ++checks;
                }
            }
        }
    }
    std::cout << checks << " DJ Energy model-approved timing checks passed\n";
}
