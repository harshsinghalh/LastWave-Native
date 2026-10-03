#!/usr/bin/env python3
"""Apply the reviewed integration patches to NewTube's pinned submodule tree."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = "756e7e56acba61ccdf5b4d5a802963f0eb62616c"

def git(directory, *arguments, check=True):
    return subprocess.run(["git", "-C", str(directory), *arguments],
                          text=True, capture_output=True, check=check)

def main():
    source = ROOT / "newtube"
    if not (source / ".git").exists():
        git(ROOT, "submodule", "update", "--init", "--recursive", "newtube")
    if git(source, "rev-parse", "HEAD").stdout.strip() != EXPECTED:
        raise SystemExit("NewTube must be checked out at v1.15.0's recorded commit.")
    for folder, name in [("", "newtube"), ("SharedModules", "sharedmodules"),
                         ("MediaServiceCore", "mediaservicecore")]:
        repository = source / folder
        patch = ROOT / "integration" / (name + ".patch")
        if git(repository, "apply", "--ignore-whitespace", "--reverse", "--check", str(patch), check=False).returncode == 0:
            print(name + ": integration already applied")
            continue
        git(repository, "apply", "--ignore-whitespace", "--check", str(patch))
        git(repository, "apply", "--ignore-whitespace", str(patch))
        print(name + ": integration applied")

if __name__ == "__main__":
    main()
