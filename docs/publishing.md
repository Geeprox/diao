# Diao 发布路线

使用 Geeprox 的现有 [商店条目](https://chromewebstore.google.com/detail/jbamhjcmjhmmhehjnnblflckmikhjojm) 发版本。安装身份为 jbamhjcmjhmmhehjnnblflckmikhjojm。资料见[隐私政策](https://geeprox.github.io/tab-cadence-support/)与[审核测试页](https://geeprox.github.io/tab-cadence-support/review-fixture.html)。

## Chrome 扩展

使用 `python3 -B scripts/package_store.py --version 0.4` 生成签名前的 ZIP 与 SHA-256 清单。ZIP 根目录含 manifest.json、运行文件、图标与许可证。开发 manifest 公钥、API 密钥、探针、本机数据和 Mac 助手不进入 ZIP。开发扩展沿用原本的公钥。Geeprox 已启用验证上传。在隔离目录解出 ZIP，使用发布者钥匙串中的上传签名密钥生成 CRX3，核对签名与包内容后上传 CRX。发布后按商店自己的签名和扩展 ID 安装。

在[现有商店条目](https://chrome.google.com/webstore/devconsole/680d8fb6-e1f9-42bb-91c8-109b4e120390/jbamhjcmjhmmhehjnnblflckmikhjojm/edit/package)的 **Package → View public key** 可取得公钥，用来核对商店身份的隔离安装。验收安装、原生连接、钥匙串隔离与旧用户迁移。商店安装可能使用不同的身份，其 API 配置继承需单独验证。 [Chrome 扩展身份](https://developer.chrome.com/docs/extensions/reference/manifest/key)

独立安装扩展可使用网页监听、事项管理、ChatGPT 页内工具和可选模型分析。安装并授权 Mac 助手后，另有原生浮标、可见性倒计时和最近访问切换。Chrome 本机保存、通行密钥恢复和配对码恢复均可独立使用。钥匙串模式由稳定签名版支持。

## macOS 助手

[GitHub Actions](../.github/workflows/macos-release.yml) 支持手动验收和 Developer ID 正式分发。安装步骤见 [Mac 助手安装说明](mac-install.md)。

1. 构建入口使用 `bash scripts/build_macos_release.sh /absolute/output-directory 0.4`。商店身份写入签名包的 Info.plist，凭据调用者校验检查该身份和签名 Chrome 父进程。安装器需将相同 origin 写入 Native Messaging `allowed_origins`。 [Chrome 原生宿主](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
2. 给正式发布工作流配置 Developer ID Application 证书和 Apple 公证团队 API key。将 Base64 编码的 PKCS#12 证书、导入口令和 .p8 私钥分别保存到 Actions secrets `DIAO_DEVELOPER_ID_P12`、`DIAO_DEVELOPER_ID_PASSWORD`、`DIAO_NOTARY_API_KEY`。将 key ID 和 Issuer ID 保存到 Actions 变量 `DIAO_NOTARY_KEY_ID` 和 `DIAO_NOTARY_ISSUER_ID`。工作流使用独立临时钥匙串。本机签名构建可使用已安装的 `DIAO_CODESIGN_IDENTITY` 与 `DIAO_NOTARY_PROFILE`。
3. 构建使用 Hardened Runtime 和可信时间戳签名。公证通过后为安装 DMG 和更新 ZIP 内的 App 装订票据，再输出归档和校验值。 [Apple 签名与公证](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
4. 在干净 Mac 上验收首次安装和授权、旧助手迁移、Chrome 接续与更新。新旧正式版使用同一 Apple 开发团队的签名。

分发版使用独立的 App bundle ID 和钥匙串服务。干净账户的助手安装及辅助功能权限需要独立验收。签名版本升级到新二进制后，还需验证系统授权及钥匙串的连续性。

### 助手签名更新

首次激活自动更新时，使用固定的 Sparkle 2.10.1 工具生成专用于 Diao 的更新签名密钥。将公开部分配置到 GitHub Actions 变量 `DIAO_UPDATE_PUBLIC_KEY`，私密部分存入 Actions secret `DIAO_SPARKLE_PRIVATE_KEY`，并单独保留发布密钥备份。保持所有发布的更新公钥一致。

打标签后，工作流生成 DMG、Sparkle 更新 ZIP、SHA-256 和签名的 `diao-appcast.xml`，核对归档签名可用，再放入同一个 GitHub Release 草稿。确认更新包后发布为最新正式 Release。助手通过固定的最新正式 Release 地址检查签名更新。正式更新包需要稳定的 Developer ID 签名、公证凭据与配套的 Sparkle 签名密钥。手动构建不附带更新通道。

先安装具备更新通道的 Diao Bridge，再用下一版本的签名归档实测下载、忙时延后、原子安装与 Chrome 重新连接。开发版、已安装商店版和正式发布签名通道分别验收。[Sparkle 更新发布文档](https://sparkle-project.org/documentation/publishing/)

## 审核与公开发布

完整合并版提交前，确认隐私政策和验收夹具可通过公开 HTTPS 访问、Mac 助手安装链接可用，并告知审核方手动信任步骤与会话凭据限制。若扩展代码有更新，递增版本号后上传到同一条目。

第一轮可选择 Unlisted 并在审核通过后手动发布，邀请测试用户安装。完成新装和升级验收后，在同一条目转 Public。所有可见性均需审核。 [分发](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) · [提交审核](https://developer.chrome.com/docs/webstore/publish/)
