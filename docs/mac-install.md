# Tab Cadence Mac 助手

适用 Apple silicon Mac、macOS 27.2 或更新版本。网页监听和 ChatGPT 页内工具可在只安装 Chrome 扩展时使用。Mac 助手提供标签旁提醒、仅可见时推进的关闭倒计时和 Control+Tab 最近访问切换。

1. 从本项目的 GitHub Release 下载 DMG 和同名的 SHA‑256 文件。在下载目录运行 `shasum -a 256 -c TabCadence-0.4-macOS-arm64.dmg.sha256`，确认显示 OK。
2. 打开 DMG，将 **Tab Cadence Bridge** 拖入「应用程序」。从「应用程序」打开它。如果 macOS 识别为未公证软件，确认来源与校验通过后，可由你在「系统设置 → 隐私与安全性」选择「仍要打开」批准此 App。遇到警告称 App 会损坏电脑时停止安装。
3. 助手会自动连接 Chrome。按窗口提示在「辅助功能」中开启 Tab Cadence Bridge，返回助手即可看到状态。再到 Tab Cadence 的 macOS 设置启用提醒或最近使用切换。如果检查到同名开发版注册，先按助手提示解决连接冲突。
4. 这个构建使用 ad hoc 签名。模型连接可保存在 Chrome，也可通过 Chrome 以通行密钥或设备配对码同步。macOS 钥匙串长期保存仍需要稳定签名的助手。

可在 Chrome 设置关闭原生选项，再从「应用程序」移除助手。若要移除连接配置，先核对 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/app.tabpilot.bridge.json` 的路径确实指向 Tab Cadence Bridge，再移除该文件。已有开发版 Tab Pilot 注册的账户，使用独立的 macOS 测试账户安装商店助手。

[Apple 关于打开未公证 App 的说明](https://support.apple.com/102445)
