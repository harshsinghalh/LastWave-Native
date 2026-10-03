#!/usr/bin/env python3
"""Verify the published APK using real Android UI and its persisted preferences."""
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "com.harsh.layawave"
OUT = Path("runtime-verification")
OUT.mkdir(exist_ok=True)
checks = []

def adb(*arguments):
    return subprocess.run(["adb", *arguments], check=True, capture_output=True,
                          text=True, timeout=120).stdout

def snapshot(name):
    adb("shell", "uiautomator", "dump", "/sdcard/laya-ui.xml")
    xml = adb("shell", "cat", "/sdcard/laya-ui.xml")
    (OUT / (name + ".xml")).write_text(xml)
    return ET.fromstring(xml)

def screenshot(name):
    result = subprocess.run(["adb", "exec-out", "screencap", "-p"], check=True,
                            capture_output=True, timeout=60)
    (OUT / (name + ".png")).write_bytes(result.stdout)

def find(tree, label):
    for node in tree.iter("node"):
        if label.lower() in (node.get("text", "") + " " + node.get("content-desc", "")).lower():
            return node
    return None

def tap(node):
    numbers = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
    if len(numbers) != 4:
        raise AssertionError("UI target has no bounds")
    adb("shell", "input", "tap", str((numbers[0]+numbers[2])//2), str((numbers[1]+numbers[3])//2))
    time.sleep(2)

def wait_for(label, name, attempts=12):
    for attempt in range(attempts):
        tree = snapshot(name)
        node = find(tree, label)
        if node is not None:
            return tree, node
        time.sleep(2)
    raise AssertionError("UI element not visible: " + label)

def policy():
    xml = adb("shell", "run-as", PACKAGE, "cat", "shared_prefs/laya_policy.xml")
    root = ET.fromstring(xml)
    return json.loads(root.find("string[@name='policy']").text)

try:
    adb("install", "-r", "-t", sys.argv[1])
    adb("logcat", "-c")
    for permission in ("android.permission.POST_NOTIFICATIONS", "android.permission.READ_MEDIA_AUDIO"):
        subprocess.run(["adb", "shell", "pm", "grant", PACKAGE, permission], capture_output=True)
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/com.lastwave.app.MainActivity")
    time.sleep(15)
    assert adb("shell", "pidof", PACKAGE).strip(), "Application is not running"
    checks.append("APK installs and combined Application/MainActivity start")
    tree = snapshot("startup")
    guest = find(tree, "Continue as Guest")
    if guest is not None:
        tap(guest)
    tree, _ = wait_for("Videos", "main-videos")
    dismiss = find(tree, "Dismiss update")
    if dismiss is not None:
        tap(dismiss)
        tree = snapshot("main-videos")
    feed = next((n for n in tree.iter("node") if n.get("text", "").lower() == "feed"), None)
    assert feed is not None, "LastWave Feed tab missing"
    tap(feed)
    wait_for("Infinite Radio", "main-music")
    screenshot("main")
    checks.append("LastWave music shell and video tab render")
    tree = snapshot("main-music-navigation")
    videos = next((n for n in tree.iter("node") if n.get("text", "").lower() == "videos"), None)
    assert videos is not None, "Videos tab missing"
    tap(videos)
    _, controls = wait_for("Feed controls", "video-controls-entry")
    tap(controls)
    tree, label = wait_for("Filter videos and comments", "laya-controls")
    screenshot("laya-controls")
    y = list(map(int, re.findall(r"\d+", label.get("bounds"))))
    center = (y[1]+y[3])//2
    switches = []
    for node in tree.iter("node"):
        if node.get("checkable") == "true":
            bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
            if len(bounds) == 4:
                switches.append((abs((bounds[1]+bounds[3])//2-center), node))
    assert switches, "Filter switch missing"
    tap(min(switches, key=lambda pair: pair[0])[1])
    assert policy()["enabled"] is False, "Toggle was not persisted"
    adb("shell", "input", "keyevent", "4")
    _, controls = wait_for("Feed controls", "settings-return")
    tap(controls)
    wait_for("Filter videos and comments", "laya-reopened")
    assert policy()["enabled"] is False, "Toggle changed on reopening settings"
    checks.append("Laya settings render and toggle persists across reopening")
    screenshot("laya-reopened")
    adb("shell", "input", "keyevent", "4")
    wait_for("Feed controls", "video-feed")
    screenshot("video-feed")
    assert adb("shell", "pidof", PACKAGE).strip(), "Application exited during navigation"
finally:
    screenshot("final-state")
    process = adb("shell", "pidof", PACKAGE).strip()
    if process:
        application_log = adb("logcat", "-d", "--pid=" + process.split()[0])
        (OUT / "application.log").write_text(application_log)
        assert "GlobalPreferences isn't initialized" not in application_log, "NewTube media engine context was not initialized"
    (OUT / "crash.log").write_text(adb("logcat", "-b", "crash", "-d"))
    (OUT / "report.json").write_text(json.dumps({"completed_checks": checks}, indent=2))

print(json.dumps({"passed": True, "checks": checks}, indent=2))
