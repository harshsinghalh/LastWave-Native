#!/usr/bin/env bash
set -euo pipefail
./gradlew :app:installDebug --stacktrace
# Provision the original download so the real Android preparation path is tested.
adb push /tmp/laya-source.onnx /data/local/tmp/laya-model.onnx
adb shell chmod 644 /data/local/tmp/laya-model.onnx
adb shell run-as com.lastwave.dj mkdir -p files/laya
adb shell run-as com.lastwave.dj cp /data/local/tmp/laya-model.onnx files/laya/model.onnx
./gradlew :app:connectedDebugAndroidTest --stacktrace
# AGP's test runner may already have uninstalled the application under test.
if adb shell pm path com.lastwave.dj | rg -q '^package:'; then
  adb uninstall com.lastwave.dj
fi
adb install app/build/outputs/apk/release/app-release.apk
adb shell am force-stop com.lastwave.dj
adb logcat -c
adb shell am start -W -n com.lastwave.dj/com.lastwave.app.MainActivity
sleep 8
adb shell pidof com.lastwave.dj
adb logcat -d -s AndroidRuntime > app/build/outputs/release-startup.txt
if rg 'FATAL EXCEPTION' app/build/outputs/release-startup.txt; then exit 1; fi
