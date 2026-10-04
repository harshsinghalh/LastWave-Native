#!/usr/bin/env python3
"""Download immutable, SHA-256 verified Laya weights used by the app and device tests."""
import hashlib
import argparse
import shutil
import urllib.request
from pathlib import Path
from prepare_laya_weights import prepare

parser = argparse.ArgumentParser()
parser.add_argument('dest', type=Path)
parser.add_argument('--keep-source', type=Path, help='Keep the signed INT8 source for Android preparation testing')
args = parser.parse_args()
dest = args.dest
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
    if args.keep_source:
        args.keep_source.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(partial, args.keep_source)
    prepare(partial)
    partial.replace(dest)
    print('Pinned Laya model downloaded, prepared and SHA-256 verified.')
finally:
    partial.unlink(missing_ok=True)
