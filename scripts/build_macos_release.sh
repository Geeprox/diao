#!/bin/bash
# 构建 Apple silicon DMG。正式签名和公证由发布环境提供。
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
if [[ $# != 2 || "$1" != /* || ! "$2" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Usage: scripts/build_macos_release.sh /absolute/output-directory 0.1" >&2
  exit 2
fi
output=$1
version=$2
sign_identity="${DIAO_CODESIGN_IDENTITY:-}"
notary_profile="${DIAO_NOTARY_PROFILE:-}"
if [[ -n "$sign_identity" && -z "$notary_profile" ]]; then
  echo 'Developer ID 构建需要 Apple 公证的钥匙串配置。' >&2
  exit 2
fi
if [[ -n "${DIAO_SPARKLE_PRIVATE_KEY:-}" ]]; then
  if [[ -z "${DIAO_UPDATE_PUBLIC_KEY:-}" ]]; then
    echo '缺少 Diao 更新公钥。' >&2
    exit 2
  fi
  if [[ -z "$sign_identity" ]]; then
    echo '正式 Diao 更新包需要 Developer ID 签名和 Apple 公证。' >&2
    exit 2
  fi
fi
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
if [[ -n "$sign_identity" ]]; then
  sign_args=(--force --timestamp --sign "$sign_identity")
  notary_args=(--keychain-profile "$notary_profile")
  if [[ -n "${DIAO_SIGNING_KEYCHAIN:-}" ]]; then
    sign_args+=(--keychain "$DIAO_SIGNING_KEYCHAIN")
    notary_args+=(--keychain "$DIAO_SIGNING_KEYCHAIN")
  fi
  framework="$app/Contents/Frameworks/Sparkle.framework"
  if [[ -d "$framework" ]]; then
    # 保留 Sparkle 下载服务的沙盒权限，按嵌套顺序先签内部程序。
    codesign "${sign_args[@]}" --options runtime "$framework/Versions/B/XPCServices/Installer.xpc"
    codesign "${sign_args[@]}" --options runtime --preserve-metadata=entitlements "$framework/Versions/B/XPCServices/Downloader.xpc"
    codesign "${sign_args[@]}" --options runtime "$framework/Versions/B/Autoupdate"
    codesign "${sign_args[@]}" --options runtime "$framework/Versions/B/Updater.app"
    codesign "${sign_args[@]}" --options runtime "$framework"
  fi
  codesign "${sign_args[@]}" --options runtime "$app"
  codesign --verify -R='anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists' "$app"
else
  codesign --force --timestamp=none --sign - "$app"
fi
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
if [[ -n "$sign_identity" ]]; then
  codesign "${sign_args[@]}" "$work/$dmg"
  # 公证 DMG 时 Apple 同时为嵌入的 App 签发票据，供更新 ZIP 使用。
  xcrun notarytool submit "$work/$dmg" "${notary_args[@]}" --output-format json > "$work/notary-submit.json"
  submission="$(python3 -B -c 'import json, sys; print(json.load(sys.stdin)["id"])' < "$work/notary-submit.json")"
  printf 'Apple notarization submission %s\n' "$submission"
  if ! xcrun notarytool wait "$submission" "${notary_args[@]}" --output-format json > "$work/notary-result.json"; then
    cat "$work/notary-result.json" >&2
    exit 1
  fi
  status="$(python3 -B -c 'import json, sys; print(json.load(sys.stdin)["status"])' < "$work/notary-result.json")"
  printf 'Apple notarization status %s\n' "$status"
  if [[ "$status" != Accepted ]]; then
    xcrun notarytool log "$submission" "${notary_args[@]}" >&2 || true
    exit 1
  fi
  for path in "$work/$dmg" "$app"; do
    xcrun stapler staple "$path"
    xcrun stapler validate "$path"
  done
  /usr/bin/syspolicy_check distribution "$app"
fi
hdiutil verify "$work/$dmg"
assets="$work/release"
mkdir "$assets"
if [[ -n "${DIAO_SPARKLE_PRIVATE_KEY:-}" ]]; then
  bash scripts/publish_macos_update.sh "$work" "$app" "$assets" "$version"
fi
cp "$work/$dmg" "$assets/$dmg"
(cd "$assets" && shasum -a 256 "$dmg" > "$dmg.sha256")
cp "$assets/"* "$output/"
echo "Built $dmg."
