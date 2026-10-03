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

def wait_for_exact(label, name, attempts=12):
    for _ in range(attempts):
        tree = snapshot(name)
        node = next((n for n in tree.iter("node")
                     if n.get("text", "").lower() == label.lower()
                     and n.get("class") != "android.widget.EditText"), None)
        if node is not None:
            return tree, node
        time.sleep(2)
    raise AssertionError("Exact UI label not visible: " + label)

def policy():
    xml = adb("shell", "run-as", PACKAGE, "cat", "shared_prefs/laya_policy.xml")
    root = ET.fromstring(xml)
    return json.loads(root.find("string[@name='policy']").text)

def scroll_for(label, name, attempts=10):
    size = list(map(int, re.findall(r"\d+", adb("shell", "wm", "size"))))[-2:]
    width, height = size
    for _ in range(attempts):
        tree = snapshot(name)
        node = find(tree, label)
        if node is not None:
            return tree, node
        adb("shell", "input", "swipe", str(width//2), str(int(height*.8)),
            str(width//2), str(int(height*.35)), "400")
        time.sleep(1)
    raise AssertionError("Could not scroll to: " + label)

def enter_text(node, value):
    tap(node)
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    adb("shell", "input", "keyevent", *("KEYCODE_DEL" for _ in range(64)))
    adb("shell", "input", "text", value.replace(" ", "%s"))
    adb("shell", "input", "keyevent", "4")

def switch_by_label(tree, label):
    y = list(map(int, re.findall(r"\d+", label.get("bounds"))))
    center = (y[1]+y[3])//2
    switches = []
    for node in tree.iter("node"):
        bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
        if node.get("checkable") == "true" and len(bounds) == 4:
            switches.append((abs((bounds[1]+bounds[3])//2-center), node))
    assert switches, "No switch beside the requested setting"
    return min(switches, key=lambda pair: pair[0])[1]

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
    _, prompt = scroll_for("Your prompt", "offline-prompt")
    enter_text(prompt, "enable filters")
    _, apply = scroll_for("Apply prompt", "offline-prompt-apply")
    tap(apply)
    assert policy()["enabled"] is True, "Offline enable prompt did not update the shared policy"
    tree, prompt = scroll_for("Your prompt", "offline-prompt-enabled")
    enter_text(prompt, "disable filters")
    _, apply = scroll_for("Apply prompt", "offline-prompt-disable")
    tap(apply)
    assert policy()["enabled"] is False, "Offline disable prompt did not update the shared policy"
    checks.append("Prompt commands enable and disable filtering without a service URL")
    screenshot("offline-prompt")
    adb("shell", "input", "keyevent", "4")
    wait_for("Feed controls", "video-feed")
    screenshot("video-feed")
    tree = snapshot("video-settings-entry")
    settings = find(tree, "Video settings")
    assert settings is not None, "Video settings header action missing"
    tap(settings)
    tree, _ = wait_for("Video settings", "video-settings-root")
    _, playback = scroll_for("Playback", "video-settings-playback-entry")
    tap(playback)
    wait_for_exact("Playback", "video-playback-settings")
    wait_for_exact("Video settings", "video-playback-settings")
    screenshot("video-playback-settings")
    _, ending = wait_for_exact("When a video ends", "playback-choice-entry")
    tap(ending)
    _, repeat = wait_for_exact("Repeat the video", "playback-choice-dialog")
    tap(repeat)
    tree, _ = wait_for_exact("Repeat the video", "playback-choice-saved")
    assert find(tree, "Cancel") is None, "Choice dialog did not close after selection"
    tree, seek_label = scroll_for("Swipe to seek", "playback-gesture-switch")
    tap(switch_by_label(tree, seek_label))
    prefs = ET.fromstring(adb("shell", "run-as", PACKAGE, "cat", "shared_prefs/newtube_gestures.xml"))
    assert prefs.find("boolean[@name='seek_swipe']").get("value") == "false", "NewTube gesture preference was not persisted"
    screenshot("playback-gesture-saved")
    adb("shell", "input", "keyevent", "4")
    _, playback = scroll_for("Playback", "playback-reopen-entry")
    tap(playback)
    wait_for_exact("Repeat the video", "playback-choice-reopened")
    tree, seek_label = scroll_for("Swipe to seek", "playback-gesture-reopened")
    assert switch_by_label(tree, seek_label).get("checked") == "false", "Reopened gesture switch lost the saved preference"
    checks.append("LastWave choice dialogs and switches persist the original NewTube playback preferences")
    adb("shell", "input", "keyevent", "4")
    _, search = wait_for("Search video settings", "video-settings-search-entry")
    tap(search)
    tree, _ = wait_for("Search video settings", "video-settings-search")
    field = next((n for n in tree.iter("node") if n.get("class") == "android.widget.EditText"), None)
    assert field is not None, "LastWave video settings search field missing"
    enter_text(field, "captions")
    tree, result = wait_for_exact("Captions", "video-settings-search-results")
    tap(result)
    wait_for_exact("Captions", "video-settings-captions")
    wait_for_exact("Video settings", "video-settings-captions")
    screenshot("video-settings-captions")
    checks.append("LastWave video settings tree and global search navigate through NewTube settings")
    assert adb("shell", "pidof", PACKAGE).strip(), "Application exited during navigation"
finally:
    screenshot("final-state")
    process = adb("shell", "pidof", PACKAGE).strip()
    if process:
        application_log = adb("logcat", "-d", "--pid=" + process.split()[0])
        (OUT / "application.log").write_text(application_log)
        assert "GlobalPreferences isn't initialized" not in application_log, "NewTube media engine context was not initialized"
    crash = adb("logcat", "-b", "crash", "-d")
    (OUT / "crash.log").write_text(crash)
    (OUT / "report.json").write_text(json.dumps({"completed_checks": checks}, indent=2))
    assert "Process: " + PACKAGE not in crash, "Android recorded an application crash"

print(json.dumps({"passed": True, "checks": checks}, indent=2))
