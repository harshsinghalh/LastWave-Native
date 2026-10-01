# Laya integration

LastWave v4.3.0 uses Laya **v0.3.4** as a build-time typed-decision layer for the Personal DJ profile.

Laya does not process PCM samples during playback. CI reads the user's natural-language preference, asks Laya to classify the desired concert-impact aggressiveness, then generates compact C++ and C# constants. The explicitly requested -2 dB to +5 dB operating window remains fixed; Laya may only tune trigger sensitivity/timing.

If the Laya package/model cannot be loaded during a build, the generator emits the checked-in safe fallback profile so audio builds remain deterministic.

The Laya source supplied for this integration identifies itself as Apache-2.0 licensed.
