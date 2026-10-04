#!/usr/bin/env python3
"""Verify successful reports before reusing an identical application's CI build."""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(sys.argv[1])
html = (root / 'reports/tests/testDebugUnitTest/index.html').read_text()
for label, expected in [('tests', 135), ('failures', 0), ('skipped', 0)]:
    result = re.search(r'class="counter">\s*(\d+)\s*</div>\s*<p>' + label + r'</p>', html)
    assert result and int(result.group(1)) == expected, f'Unit report {label} mismatch'
xml_files = list((root / 'outputs/androidTest-results').rglob('TEST-*.xml'))
assert len(xml_files) == 1, 'Expected one Android test result'
suite = ET.parse(xml_files[0]).getroot()
assert suite.get('tests') == '8'
assert all(suite.get(name) == '0' for name in ['failures', 'errors', 'skipped'])
assert not suite.findall('.//failure') and not suite.findall('.//error')
cases = suite.findall('.//testcase')
assert len(cases) == 8
names = [case.get('name', '') for case in cases]
for expected in ['actualAndroidInferenceSelectsPeaksAndCaches', 'jniProcessesVolumeAndBitPerfectBypassesCue',
                 'layaChoiceAndQuestionsPersistWithoutChangingTimedDefaults']:
    assert any(expected in name for name in names), f'Missing actual Android test: {expected}'
print('Verified previous execution: 135 unit tests and 8 actual Android tests passed; none failed or skipped.')
