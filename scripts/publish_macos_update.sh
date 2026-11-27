#!/bin/bash
# 签名发布包和更新源。密钥仅由发布环境提供，临时文件随构建目录清除。
set -euo pipefail
[[ $# == 4 ]]
work=$1
app=$2
output=$3
version=$4
archive="Diao-$version-macOS-arm64.zip"
key="$work/update-signing.key"
trap 'rm -f -- "$key"' EXIT
(
  umask 077
  printf '%s' "$DIAO_SPARKLE_PRIVATE_KEY" > "$key"
)
unset DIAO_SPARKLE_PRIVATE_KEY
signer="$work/sparkle/bin/sign_update"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app" "$work/$archive"
signature="$("$signer" --ed-key-file "$key" -p "$work/$archive")"
xcrun swift -module-cache-path "$work/module-cache" scripts/verify_update.swift "$work/$archive" "$signature"
python3 - "$work" "$archive" "$version" "$signature" <<'PY'
from pathlib import Path
from xml.sax.saxutils import quoteattr
import sys

root, archive, version, signature = sys.argv[1:]
asset = Path(root) / archive
url = 'https://github.com/Geeprox/diao/releases/download/v' + version + '/' + archive
(Path(root) / 'diao-appcast.xml').write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Diao Bridge</title>
    <item>
      <title>Diao Bridge {version}</title>
      <sparkle:version>{version}</sparkle:version>
      <sparkle:minimumSystemVersion>27.2</sparkle:minimumSystemVersion>
      <enclosure url={quoteattr(url)} length="{asset.stat().st_size}" type="application/octet-stream" sparkle:edSignature={quoteattr(signature)} />
    </item>
  </channel>
</rss>
''')
PY
"$signer" --ed-key-file "$key" "$work/diao-appcast.xml"
"$signer" --verify --ed-key-file "$key" "$work/diao-appcast.xml"
cp "$work/$archive" "$work/diao-appcast.xml" "$output"
(cd "$output" && shasum -a 256 "$archive" > "$archive.sha256")
