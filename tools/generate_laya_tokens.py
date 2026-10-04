#!/usr/bin/env python3
"""Freeze exact tokenizer inputs, never predictions. No music training data needed.

pip install transformers==4.51.3 torch==2.6.0
python tools/generate_laya_tokens.py --laya-source /path/to/laya --model-dir /path/to/laya-onnx
The Laya source must contain laya/common.py (upstream v0.3.4).
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--laya-source', type=Path, required=True)
parser.add_argument('--model-dir', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.laya_source.resolve()))
from laya.common import build_sequence
from transformers import PreTrainedTokenizerFast

config = json.loads((args.model_dir / 'tokenizer_config.json').read_text())
tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(args.model_dir / 'tokenizer.json'),
    **{k: v for k, v in config.items() if k.endswith('_token')})
intensity = ['quiet', 'moderate', 'high', 'very high']
change = ['falling below this track baseline', 'steady with no distinctive lift',
          'strong rise above this track baseline']
activity = ['weak', 'moderate', 'strong']
focus = ['overall energy', 'bass-led drops', 'vocal-range lifts']
entries = {}
for f, i, r, b, v in itertools.product(range(3), range(4), range(3), range(3), range(3)):
    question = {'t': 'choice', 'ins':
        'Choose whether this section of a music track deserves a brief DJ boost. '
        'Prefer distinctive high-intensity musical peaks and energy lifts; preserve ordinary, '
        'quiet or steady passages.' + ('' if f == 0 else ' Focus on ' + focus[f] + '.'),
        'crit': {'highlight': 'a strong energetic rise, bass drop or vocal lift worth emphasizing briefly',
                 'ordinary': 'a quiet, steady or ordinary section that should play unchanged'}}
    state = {'intensity': intensity[i], 'energy_change': change[r],
             'bass': activity[b], 'vocals': activity[v], 'duration': 'sustained'}
    ids, markers = build_sequence(tokenizer, state, question, max_len=512, head_max_len=192)
    assert len(markers) == 2 and len(ids) < 512
    entries['.'.join(map(str, (f, i, r, b, v)))] = {'ids': ids, 'markers': markers}
out = Path(__file__).resolve().parents[1] / 'app/src/main/assets/laya/dj_tokens.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'sequence_length': 512, 'pad_id': tokenizer.pad_token_id,
    'temperature': 1.9063563346862793, 'entries': entries}, separators=(',', ':')) + '\n')
print(f'Wrote {len(entries)} exactly tokenized questions to {out.name}')
