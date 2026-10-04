#!/usr/bin/env python3
"""Download immutable, SHA-256 verified Laya weights used by the app and device tests."""
import hashlib
import sys
import urllib.request
from pathlib import Path

dest = Path(sys.argv[1])
dest.parent.mkdir(parents=True, exist_ok=True)
partial = dest.with_suffix('.part')
url = 'https://huggingface.co/tozp/laya-onnx/resolve/0d1f7ebf46a3ea04ec4424df602f96ddefb66766/model_int8.onnx'
expected = 'd337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469'
try:
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=120) as response, partial.open('wb') as output:
        while block := response.read(1024 * 1024):
            digest.update(block)
            output.write(block)
    assert partial.stat().st_size == 424_348_081 and digest.hexdigest() == expected
    partial.replace(dest)
    print('Pinned Laya model downloaded and SHA-256 verified.')
finally:
    partial.unlink(missing_ok=True)
