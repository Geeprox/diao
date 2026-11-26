#!/bin/bash
# 构建用户手动信任的 Apple silicon DMG，供本机或 GitHub Actions 使用。
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
if [[ $# != 2 || "$1" != /* || ! "$2" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Usage: scripts/build_macos_release.sh /absolute/output-directory 0.1" >&2
  exit 2
fi
output=$1
version=$2
[[ "$(uname -m)" == arm64 ]] || { echo 'Apple silicon runner required.' >&2; exit 1; }
mkdir -p "$output"
digest="$(printf '%s' "$root" | shasum -a 256 | cut -c1-12)"
cache="$HOME/Library/Caches/CodexBuilds.noindex/TabPilot-$digest/swift-macos-arm64/Release"
mkdir -p "$cache"
work="$(mktemp -d "$cache/github-dmg.XXXXXXXX")"
printf '%s\n' "$$" > "$work/run.lock"
trap 'rm -rf -- "$work"' EXIT
export TABCADENCE_BUILD_ROOT="$work"
export TABCADENCE_SOURCE_PATH="$root"
python3 -B - <<'PY'
from pathlib import Path
from datetime import datetime, timezone
import json, os
path = Path(os.environ["TABCADENCE_BUILD_ROOT"])
(path/"manifest.json").write_text(json.dumps({
    "source": os.environ["TABCADENCE_SOURCE_PATH"],
    "toolchain": "Xcode Swift and hdiutil", "purpose": "store companion DMG",
    "started": datetime.now(timezone.utc).isoformat(), "status": "running",
    "reproduce": "bash scripts/build_macos_release.sh /absolute/output-directory 0.1",
}))
PY
app="$work/disk/Diao Bridge.app"
binary="$app/Contents/MacOS/DiaoBridge"
mkdir -p "$app/Contents/MacOS" "$work/module-cache"
cd "$root"
iconset="$work/Diao.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  /usr/bin/sips -z "$size" "$size" docs/assets/branding/Diao.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  /usr/bin/sips -z "$((size*2))" "$((size*2))" docs/assets/branding/Diao.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$iconset" -o "$work/Diao.icns"
framework_flags=(-framework AppKit -framework ApplicationServices -framework Carbon -framework Security)
if [[ -n "${DIAO_UPDATE_PUBLIC_KEY:-}" ]]; then
  sparkle="${DIAO_SPARKLE_ARCHIVE:-"$work/Sparkle-2.10.1.tar.xz"}"
  if [[ -z "${DIAO_SPARKLE_ARCHIVE:-}" ]]; then
    curl --fail --location --silent --show-error --output "$sparkle" \
      https://github.com/sparkle-project/Sparkle/releases/download/2.10.1/Sparkle-2.10.1.tar.xz
  fi
  printf '1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27  %s\n' "$sparkle" | shasum -a 256 -c -
  mkdir -p "$work/sparkle" "$app/Contents/Frameworks"
  tar -xJf "$sparkle" -C "$work/sparkle"
  /usr/bin/ditto "$work/sparkle/Sparkle.framework" "$app/Contents/Frameworks/Sparkle.framework"
  framework_flags+=(-F "$app/Contents/Frameworks" -framework Sparkle -Xlinker -rpath -Xlinker '@executable_path/../Frameworks')
fi
xcrun swiftc -O -target arm64-apple-macos27.2 -swift-version 5 -parse-as-library \
  -module-cache-path "$work/module-cache" -o "$binary" \
  native/Mapping.swift native/Shortcuts.swift native/NativeHost.swift native/Credentials.swift native/StoreSetup.swift native/Updates.swift \
  "${framework_flags[@]}"
python3 -B scripts/bundle.py "$app" --store-extension-id jbamhjcmjhmmhehjnnblflckmikhjojm --release-version "$version" --icon "$work/Diao.icns"
codesign --force --timestamp=none --sign - "$app"
codesign --verify --deep --strict "$app"
minimum="$(/usr/libexec/PlistBuddy -c 'Print LSMinimumSystemVersion' "$app/Contents/Info.plist")"
if python3 -B - "$minimum" "$(sw_vers -productVersion)" <<'PY2'
import sys
from itertools import zip_longest
def version(text):
    return [int(value) for value in text.split(".")]
for required, actual in zip_longest(version(sys.argv[1]), version(sys.argv[2]), fillvalue=0):
    if required != actual:
        sys.exit(required > actual)
PY2
then
  "$binary" --self-test
else
  printf 'Runner system is older than %s. Runtime self-test requires a supported Mac.\n' "$minimum"
fi
ln -s /Applications "$work/disk/Applications"
cp docs/mac-install.md "$work/disk/安装说明.md"
dmg="Diao-$version-macOS-arm64.dmg"
hdiutil create -quiet -fs HFS+ -format UDZO -volname 'Diao' \
  -srcfolder "$work/disk" "$work/$dmg"
hdiutil verify "$work/$dmg"
cp "$work/$dmg" "$output/$dmg"
(cd "$output" && shasum -a 256 "$dmg" > "$dmg.sha256")
if [[ -n "${DIAO_SPARKLE_PRIVATE_KEY:-}" ]]; then
  [[ -n "${DIAO_UPDATE_PUBLIC_KEY:-}" ]] || { echo '缺少 Diao 更新公钥。' >&2; exit 1; }
  bash scripts/publish_macos_update.sh "$work" "$app" "$output" "$version"
fi
echo "Built $dmg (ad hoc, manual trust)."
