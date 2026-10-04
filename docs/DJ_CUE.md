# DJ Cue and selective highlights

Open Settings > Audio > Output & Loudness > DJ Cue. The feature defaults to off. Enable it, choose **Automatic highlights**, answer the focus and spacing questions, and save. **Timed cue** remains available for a fixed moment such as 2:45.

## Timed cue

The updated default is 70% relative PCM amplitude before 2:45, then a 1.5-second smooth transition to 80%, +2 dB energy, +2 dB vocal presence and +3 dB bass emphasis. All timed values are editable. The 1.5 s / 80% preset button restores the requested levels. Old saved defaults (2 seconds / 90%) migrate to the new pair; other custom pairs remain unchanged. One cue repeats on each track, and shorter songs stay at the before-cue level. Pause, repeat and seek follow media position. Player updates, decoder buffering and output latency mean timed automation is not sample-accurate transport control.

## Automatic highlights

The native selector listens to untouched decoded PCM locally. It waits ten seconds after decoder reset to learn the track's level. A highlight needs a sustained 180 ms rise, enough absolute energy, and a contrast of at least 4.5 dB against a three-second baseline (6 dB for Rare). Isolated clicks, steady loud passages and quiet material do not qualify merely because they exist.

The built-in questions select strong energy rises, bass-led drops, or vocal-range-led lifts; they also select at least 35 seconds or 60 seconds between highlight starts. Bass and vocal-range ratios are frequency heuristics, not stem separation. Each selected event has a 30 ms entry from normal to 70%, reaches 80% with the chosen boosts at 1.5 seconds after selection, holds to 4.5 seconds, and returns to normal by five seconds. Native filters ease out briefly. The five-second event and spacing prevent continuous pumping. A song may legitimately have no detected highlights.

Ordinary passages keep their original level and samples when other DSP is disabled. The detector runs once in the media decoder, adds no look-ahead delay, and advances with decoded audio frames. Decoder reset (including a seek) restarts its learning and cooldown. Buffering can place audible events later than selection time. It reacts to incoming audio, rather than predicting a future chorus or ranking every part of a whole track.

**Laya:** the supplied ZIP is a Python text/JSON decision library using PyTorch/Transformers and separately downloaded large checkpoints. It is not an Android waveform model and does not establish which moments listeners consider popular. This APK uses tested native signal-based selection; it does not bundle Laya, run an untested model, or report fabricated AI confidence. The repository's existing optional Laya build-time preference generator remains available, but is not this per-track selector. A learned importance classifier would need audio features, music-specific labeled data, calibration, and a tested mobile deployment.

## Interaction with playback

The feature never changes saved EQ or clarity values. Saving it enabled disables the separate older DJ Energy mode; re-enabling DJ Energy suspends DJ Cue. Bit-Perfect, USB Exclusive, system audio effects, casting and spatial routes also suspend it. Existing DJ Energy's three-second pre-drop remains unchanged. The optional feature has neutral defaults.

Percentages refer to the automation volume stage relative to current output, not Android system volume, perceived loudness, or a final peak ceiling. Broad energy gain and frequency boosts follow that stage, so final peaks can exceed 80% amplitude; existing peak protection constrains loud output. Energy is broad gain, vocal presence a broad 2.2 kHz band, and bass emphasis a broad 90 Hz band.

## Verification

CI builds the release APK, verifies its signature, runs the full existing JVM suite plus cue timeline tests, 18 native cue/DSP checks, and 69 selective-highlight checks. Native scenarios cover several sample rates, decoder block sizes, mono/stereo, false-positive rejection, focus questions, spacing, exact envelope timing, return to normal, invalid detector samples, disabled operation and Bit-Perfect. Emulator tests exercise real Compose save/cancel/validation, default migration, mode/focus/spacing persistence, and packaged JNI PCM processing with a synthetic quiet-to-loud track.

The emulator and generated PCM do not establish listening quality, selection accuracy across real music, or behavior on physical Bluetooth/DAC/casting devices. Those require device/listening validation. A fallback debug-signed APK may not update an installed copy with a different certificate; in-place updates require the original signing key.
