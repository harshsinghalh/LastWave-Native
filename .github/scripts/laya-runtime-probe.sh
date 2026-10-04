#!/usr/bin/env bash
set -euo pipefail
./gradlew -p tools/laya-probe :app:installDebug
adb shell run-as com.lastwave.laya.probe mkdir -p files
for NAME in unsigned original; do
  adb push "/tmp/laya-$NAME.onnx" "/data/local/tmp/$NAME.onnx"
  adb shell chmod 644 "/data/local/tmp/$NAME.onnx"
  adb shell run-as com.lastwave.laya.probe cp "/data/local/tmp/$NAME.onnx" "files/$NAME.onnx"
done
adb logcat -c
./gradlew -p tools/laya-probe :app:connectedDebugAndroidTest --stacktrace
adb logcat -d -s LayaProbe > /tmp/laya-probe-log.txt
cat /tmp/laya-probe-log.txt
