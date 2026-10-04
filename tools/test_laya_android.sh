#!/usr/bin/env bash
set -euo pipefail
./gradlew :app:installDebug --stacktrace
adb push /tmp/laya-model.onnx /data/local/tmp/laya-model.onnx
adb shell chmod 644 /data/local/tmp/laya-model.onnx
adb shell run-as com.lastwave.dj mkdir -p files/laya
adb shell run-as com.lastwave.dj cp /data/local/tmp/laya-model.onnx files/laya/model.onnx
./gradlew :app:connectedDebugAndroidTest --stacktrace
