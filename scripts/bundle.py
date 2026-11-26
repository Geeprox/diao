import argparse
import base64
import os
import plistlib
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=Path)
parser.add_argument('--store-extension-id')
parser.add_argument('--release-version')
parser.add_argument('--icon', type=Path)
args = parser.parse_args()
store_id = args.store_extension_id
if store_id is not None and not re.fullmatch(r'[a-p]{32}', store_id):
    parser.error('商店扩展 ID 须由 32 个 a 至 p 的小写字母组成。')

info = {
    'CFBundleExecutable': 'TabPilotBridge',
    'CFBundleIdentifier': 'app.tabcadence.bridge' if store_id else 'app.tabpilot.bridge',
    'CFBundleName': 'Diao Bridge',
    'CFBundleDisplayName': 'Diao Bridge',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.7.0',
    'CFBundleVersion': os.environ.get('TABPILOT_BUILD_NUMBER', '8'),
    'LSMinimumSystemVersion': '27.2',
    'NSPrincipalClass': 'NSApplication',
    'LSUIElement': True,
}
if store_id:
    info['TabCadenceStoreExtensionID'] = store_id
if args.icon:
    from shutil import copyfile
    resources = args.bundle / 'Contents' / 'Resources'
    resources.mkdir(parents=True, exist_ok=True)
    copyfile(args.icon, resources / 'Diao.icns')
    info['CFBundleIconFile'] = 'Diao'
if args.release_version:
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,2}', args.release_version):
        parser.error('无效的 GitHub 发布版本。')
    info['CFBundleVersion'] = args.release_version
    info['DiaoReleaseVersion'] = args.release_version
update_key = os.environ.get('DIAO_UPDATE_PUBLIC_KEY')
if update_key:
    if not store_id or not args.release_version or len(base64.b64decode(update_key, validate=True)) != 32:
        parser.error('自动更新需要商店身份、有效发布版本和 32 字节 Ed25519 公钥。')
    info.update({
        'SUFeedURL': 'https://github.com/Geeprox/tab-cadence/releases/latest/download/diao-appcast.xml',
        'SUPublicEDKey': update_key,
        'SUEnableAutomaticChecks': True,
        'SUAutomaticallyUpdate': True,
        'SUVerifyUpdateBeforeExtraction': True,
        'SURequireSignedFeed': True,
    })
with (args.bundle / 'Contents' / 'Info.plist').open('wb') as file:
    plistlib.dump(info, file)
