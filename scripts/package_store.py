#!/usr/bin/env python3
"""生成 Chrome Web Store 上传草稿与逐文件校验清单。"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'extension'
SECRET = re.compile(rb'sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, help='覆盖发布材料的输出目录')
    parser.add_argument('--version', help='商店版本。开发 manifest 保持原版本')
    args = parser.parse_args()
    if args.version is not None:
        parts = args.version.split('.')
        if not re.fullmatch(r'(?:0|[1-9][0-9]{0,4})(?:\.(?:0|[1-9][0-9]{0,4})){0,3}', args.version) or not any(int(n) for n in parts) or any(int(n) > 65535 for n in parts):
            parser.error('商店版本须由 1 至 4 个非负整数组成，范围 0 至 65535，且不能全为 0。')
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    manifest.pop('key', None)
    source_version = manifest['version']
    version = args.version if args.version is not None else source_version
    manifest['version'] = version
    output = args.output_dir or ROOT / 'releases' / f'TabCadence-{version}'
    files = {
        'manifest.json', 'sidepanel.html', 'panel.mjs', 'worker.mjs', 'sensor.js',
        'watch-prompt.js', 'threaddeck.js', 'ui.css', 'THIRD_PARTY_LICENSES.txt', 'icons/mark.svg',
        *manifest['icons'].values(), *manifest['action']['default_icon'].values(),
        *(str(p.relative_to(SOURCE)) for p in (SOURCE / 'core').glob('*.mjs')),
    }
    payload = {}
    for name in sorted(files):
        path = SOURCE / name
        if path.is_symlink() or not path.is_file() or path.resolve().parent not in (
            SOURCE, SOURCE / 'core', SOURCE / 'icons',
        ):
            raise SystemExit(f'发现非预期路径，未打包：{name}')
        data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode() if name == 'manifest.json' else path.read_bytes()
        if SECRET.search(data):
            raise SystemExit(f'发现疑似凭据，未打包：{name}')
        payload[name] = data

    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'TabCadence-{version}-store.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for name, data in payload.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            package.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None or set(package.namelist()) != files:
            raise SystemExit('ZIP 校验失败')
        if any(package.read(name) != data for name, data in payload.items()):
            raise SystemExit('ZIP 内容与源文件不一致')

    report = {
        'artifact': archive.name, 'version': version, 'source_version': source_version,
        'sha256': digest(archive.read_bytes()),
        'bytes': archive.stat().st_size, 'store_extension_id': None,
        'ready_for_review': False, 'credentials_included': False, 'native_app_included': False,
        'files': {name: digest(data) for name, data in payload.items()},
    }
    archive.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'{archive}  {report["sha256"]}')


if __name__ == '__main__':
    main()
