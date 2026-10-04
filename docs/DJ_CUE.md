# DJ Cue

DJ Cue is an optional timed control under Settings > Audio > Output & Loudness. It defaults to off. Each track repeats the configured cue; there is no per-track profile or automatic drop detection in this mode.

The example uses 70% amplitude before 2:45, then a two-second transition to 90%, +2 dB energy, +2 dB vocal presence and +3 dB bass emphasis. These are editable. Energy is broad gain, vocals a broad 2.2 kHz presence band, and beats a broad 90 Hz band. This does not separate stems. Relative amplitude percentages are not perceived loudness percentages.

Saved EQ/clarity and the player workflow are preserved. Saving an enabled cue switches off automatic DJ Energy; turning automatic DJ Energy back on suspends the timed cue. Bit-Perfect, USB Exclusive, system audio effects, casting and spatial routes also suspend it. Short songs remain at the before-cue level. Native controls smooth toward new targets and use the existing peak-protection stage.

The normal player progress ticker updates targets around every 60 ms. Decoder buffering and output latency can add offset; this is not sample-accurate DJ transport automation.

CI builds the release APK, checks its signature, runs the existing unit tests plus DJ timeline tests, 18 production C++ DSP checks, and emulator tests for dialog save/cancel/validation and packaged JNI audio processing. The emulator does not prove Bluetooth, physical DAC, casting or listening quality. Test artifacts distinguish completed checks from pending ones.
