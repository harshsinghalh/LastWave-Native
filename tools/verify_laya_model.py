#!/usr/bin/env python3
"""Run actual quantized Laya inference and emit independent Android parity fixtures."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import numpy as np
import onnxruntime as ort

parser = argparse.ArgumentParser()
parser.add_argument('model', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
expected = '1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1'
with args.model.open('rb') as file:
    assert hashlib.file_digest(file, 'sha256').hexdigest() == expected
root = Path(__file__).resolve().parents[1]
bank = json.loads((root / 'app/src/main/assets/laya/dj_tokens.json').read_text())
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(args.model), sess_options=options, providers=['CPUExecutionProvider'])
results = []
for key in ['0.0.1.0.0', '0.2.2.2.2', '0.2.1.2.2', '1.2.2.2.0', '2.2.2.0.2']:
    entry = bank['entries'][key]
    ids = entry['ids']
    inputs = {'input_ids': np.array([ids + [bank['pad_id']] * (512 - len(ids))], np.int64),
        'attention_mask': np.array([[1] * len(ids) + [0] * (512 - len(ids))], np.int64),
        'marker_pos': np.array([entry['markers']], np.int64),
        'marker_mask': np.array([[True, True]]), 'qtype': np.array([0], np.int64)}
    start = time.monotonic()
    logits = session.run(['logits'], inputs)[0][0].astype(np.float64)
    probability = float(1 / (1 + np.exp((logits[1] - logits[0]) / bank['temperature'])))
    results.append({'key': key, 'probability': probability, 'seconds': time.monotonic() - start})
print(json.dumps(results, indent=2))
assert results[0]['probability'] < results[1]['probability']
assert results[2]['probability'] < results[1]['probability']
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'model_sha256': expected,
    'cases': results}, indent=2) + '\n')
