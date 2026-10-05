#!/usr/bin/env python3
"""Protect the supplied 4.2.2 interface from changes outside the single DJ setting."""
import subprocess
from pathlib import Path

REF = "lastwave-original-4.2.2"
roots = ["app/src/main/java/com/lastwave/app/ui", "app/src/main/res",
         "app/src/main/java/com/lastwave/app/widget", "app/src/main/java/com/lastwave/app/MainActivity.kt"]
allowed = {"app/src/main/java/com/lastwave/app/ui/settings/SettingsScreen.kt",
           "app/src/main/java/com/lastwave/app/ui/settings/SettingsViewModel.kt"}
files = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", REF, "--", *roots], text=True).splitlines()
checked = 0
for name in files:
    if name in allowed:
        continue
    original = subprocess.check_output(["git", "show", f"{REF}:{name}"])
    current = Path(name).read_bytes()
    if name.endswith("/strings.xml"):
        current = current.replace(b'<string name="app_name">LastWave DJ</string>', b'<string name="app_name">LastWave</string>')
    assert current == original, f"Original UI changed: {name}"
    checked += 1
ui = Path("app/src/main/java/com/lastwave/app/ui/settings/SettingsScreen.kt").read_text()
assert ui.count('title = "DJ Energy"') == 1
for removed in ("DjEnergyDialog", "showDjEnergyOptions", 'title = "DJ Energy options"', "Download Laya", "Timed cue"):
    assert removed not in ui, f"Removed DJ control returned: {removed}"
assert not Path("app/src/main/java/com/lastwave/app/ui/settings/DjEnergyDialog.kt").exists()
print(f"{checked} original UI/resource/widget files match 4.2.2 exactly; DJ adds one switch.")
