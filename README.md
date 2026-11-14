# Tab Cadence

<img src="extension/icons/icon-128.png" alt="" width="96">

在 Chrome 里接续网页任务，在 ChatGPT 对话中批注、浏览大纲和排队续发。

- 网页右键选择「开始监听」，填写等待和完成文案。
- 在扩展的 ChatGPT 设置中授权，打开对话后可选中文字批注。生成期间按 Enter 将问题加入队列。
- Mac 助手为可选组件。安装后可在原生标签旁显示提示，从标签旁发起关闭倒计时或点「保留」，也可选择启用 Control+Tab 最近使用切换。

## 下载

- [GitHub Releases](https://github.com/Geeprox/tab-cadence/releases)
- [Mac 助手安装说明](docs/mac-install.md)
- [隐私政策](https://geeprox.github.io/tab-cadence-support/)
- [问题反馈](https://github.com/Geeprox/tab-cadence-support/issues)

Mac 助手目前适用于 Apple silicon、macOS 27.2 或更新版本。0.1 手动信任版采用 ad hoc 签名。模型 API 可选，手动信任版使用会话连接。

## 从源码构建

使用 Node.js 22 或更新版本执行 `npm test`。用 `python3 -B scripts/package_store.py --version 0.1` 生成扩展 ZIP。

在支持的 Apple silicon Mac 上，使用 Xcode 27.2 或更新工具链执行 `bash scripts/build_macos_release.sh /absolute/output-directory 0.1`。Actions 可从默认分支执行构建，版本标签触发同一构建并生成 Release 草稿。

第三方许可见 [THIRD_PARTY_LICENSES.txt](extension/THIRD_PARTY_LICENSES.txt) 和对应源文件。

## 许可

项目原创代码采用 [MIT](LICENSE)。
