# Tab Cadence 发布路线

使用 Geeprox 的现有 [Tab Cadence 商店条目](https://chromewebstore.google.com/detail/jbamhjcmjhmmhehjnnblflckmikhjojm) 发版本。安装身份为 jbamhjcmjhmmhehjnnblflckmikhjojm。资料见[隐私政策](https://geeprox.github.io/tab-cadence-support/)与[审核测试页](https://geeprox.github.io/tab-cadence-support/review-fixture.html)。

## Chrome 扩展

使用 `python3 -B scripts/package_store.py --version 0.4` 生成签名前的 ZIP 与 SHA-256 清单。ZIP 根目录含 manifest.json、运行文件、图标与许可证。开发 manifest 公钥、API 密钥、探针、本机数据和 Mac 助手不进入 ZIP。开发扩展沿用原本的公钥。Geeprox 已启用验证上传。在隔离目录解出 ZIP，使用发布者钥匙串中的上传签名密钥生成 CRX3，核对签名与包内容后上传 CRX。发布后按商店自己的签名和扩展 ID 安装。

在[现有商店条目](https://chrome.google.com/webstore/devconsole/680d8fb6-e1f9-42bb-91c8-109b4e120390/jbamhjcmjhmmhehjnnblflckmikhjojm/edit/package)的 **Package → View public key** 可取得公钥，用来核对商店身份的隔离安装。验收安装、原生连接、钥匙串隔离与旧用户迁移。商店安装可能使用不同的身份，其 API 配置继承需单独验证。 [Chrome 扩展身份](https://developer.chrome.com/docs/extensions/reference/manifest/key)

独立安装扩展可使用网页监听、事项管理、ChatGPT 页内工具和可选模型分析。安装并授权 Mac 助手后，另有原生浮标、可见性倒计时和最近访问切换。Chrome 本机保存、通行密钥恢复和配对码恢复均可独立使用。钥匙串模式由稳定签名版支持。

## macOS 助手

首发使用 [GitHub Actions](../.github/workflows/macos-release.yml) 生成手动信任的 DMG，详见 [Mac 助手安装说明](mac-install.md)。本机开发构建使用 Apple Development 签名。若以后提供 Developer ID 签名和公证版本，可沿用以下分发流程。

1. 构建入口使用 `bash scripts/build_macos_release.sh /absolute/output-directory 0.4`。商店身份写入签名包的 Info.plist，凭据调用者校验检查该身份和签名 Chrome 父进程。安装器需将相同 origin 写入 Native Messaging `allowed_origins`。 [Chrome 原生宿主](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
2. 使用 Developer ID Application 签名，启用 hardened runtime 和可信时间戳。需要 PKG 时配置 Developer ID Installer 签名。
3. 提供可下载安装器和卸载说明。安装器注册当前用户的宿主配置，并引导用户给助手授权辅助功能。
4. 公证并装订票据，在干净 Mac 上验收 Gatekeeper、首次授权、浮标、遮挡暂停、保留、钥匙串、升级和卸载。当前开发验收覆盖 Apple silicon，其他系统范围以实际测试为准。 [Apple 签名与公证](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

分发版使用独立的 App bundle ID 和钥匙串服务。干净账户的助手安装及辅助功能权限需要独立验收。签名版本升级到新二进制后，还需验证系统授权及钥匙串的连续性。

## 审核与公开发布

完整合并版提交前，确认隐私政策和验收夹具可通过公开 HTTPS 访问、Mac 助手安装链接可用，并告知审核方手动信任步骤与会话凭据限制。若扩展代码有更新，递增版本号后上传到同一条目。

第一轮可选择 Unlisted 并在审核通过后手动发布，邀请测试用户安装。完成新装和升级验收后，在同一条目转 Public。所有可见性均需审核。 [分发](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) · [提交审核](https://developer.chrome.com/docs/webstore/publish/)
