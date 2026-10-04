#!/usr/bin/env python3
"""Re-encode pinned signed INT8 weights as UINT8 without changing dequantized values."""
import hashlib
import json
import os
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parents[1] / 'app/src/main/assets/laya/unsigned_weights.json'
XOR_128 = bytes(i ^ 128 for i in range(256))


def sha256(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def prepare(path):
    manifest = json.loads(MANIFEST.read_text())
    if path.stat().st_size != manifest['size']:
        raise ValueError('Unexpected model size')
    digest = sha256(path)
    if digest == manifest['output_sha256']:
        return
    if digest != manifest['input_sha256']:
        raise ValueError('Source model SHA-256 mismatch')
    with path.open('r+b') as output:
        for patch in manifest['patches']:
            output.seek(patch['dtype'])
            if output.read(1) != b'\x03':
                raise ValueError('Unexpected tensor type')
            output.seek(patch['dtype'])
            output.write(b'\x02')
            if patch['tag'] >= 0:
                output.seek(patch['tag'])
                if output.read(1) != b'\x2a':
                    raise ValueError('Unexpected zero-point encoding')
                output.seek(patch['tag'])
                output.write(b'\x4a')
            position, remaining = patch['start'], patch['length']
            if not (0 <= position < position + remaining <= manifest['size']):
                raise ValueError('Invalid patch offsets')
            while remaining:
                count = min(remaining, 256 * 1024)
                output.seek(position)
                block = output.read(count)
                if len(block) != count:
                    raise ValueError('Truncated model')
                output.seek(position)
                output.write(block.translate(XOR_128))
                position += count
                remaining -= count
        output.flush()
        os.fsync(output.fileno())
    if sha256(path) != manifest['output_sha256']:
        raise ValueError('Prepared model SHA-256 mismatch')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
    print('CPU-compatible Laya weights prepared and SHA-256 verified.')
