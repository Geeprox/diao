import argparse
import os
import plistlib
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
parser.add_argument('--store-extension-id')
args = parser.parse_args()
store_id = args.store_extension_id
if store_id is not None and not re.fullmatch(r'[a-p]{32}', store_id):
    parser.error('商店扩展 ID 须由 32 个 a 至 p 的小写字母组成。')

info = {
    'CFBundleExecutable': 'TabPilotBridge',
    'CFBundleIdentifier': 'app.tabcadence.bridge' if store_id else 'app.tabpilot.bridge',
    'CFBundleName': 'Tab Cadence Bridge' if store_id else 'Tab Pilot Bridge',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.5.0',
    'CFBundleVersion': os.environ.get('TABPILOT_BUILD_NUMBER', '7'),
    'LSMinimumSystemVersion': '27.2',
    'NSPrincipalClass': 'NSApplication',
    'LSUIElement': True,
}
if store_id:
    info['TabCadenceStoreExtensionID'] = store_id
with (args.bundle / 'Contents' / 'Info.plist').open('wb') as file:
    plistlib.dump(info, file)
