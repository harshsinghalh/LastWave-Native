#!/usr/bin/env bash
set -euo pipefail
./gradlew :app:installDebug --stacktrace
# Fresh install with airplane mode on: the APK must provision its own model.
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true
adb shell svc wifi disable
adb shell svc data disable
./gradlew :app:connectedDebugAndroidTest --stacktrace
# AGP's test runner may already have uninstalled the application under test.
if adb shell pm path com.lastwave.dj | grep -q '^package:'; then
  adb uninstall com.lastwave.dj
fi
adb install app/build/outputs/apk/release/app-release.apk
adb shell am force-stop com.lastwave.dj
adb logcat -c
adb shell am start -W -n com.lastwave.dj/com.lastwave.app.MainActivity
sleep 8
adb shell pidof com.lastwave.dj
adb logcat -d -s AndroidRuntime > app/build/outputs/release-startup.txt
if grep -q 'FATAL EXCEPTION' app/build/outputs/release-startup.txt; then exit 1; fi
