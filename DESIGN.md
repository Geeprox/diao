# Tab Cadence interface

品牌标记用奶白前景标签与薄荷色勾号浮标表现任务完成、可接手。墨蓝底让标记在浅色和深色 Chrome 工具栏中都有轮廓，后层用低饱和蓝表示标签队列。24 点矢量母版与 16/32/48/128 像素资产同源生成；商店 128 像素四边留 16 像素透明边距。

设置沿用 ChatGPT 的中性画布、清晰文字和低强调分隔线。主操作用黑白反差，资料状态沿用各自的语义色。

- System typography, 14px task titles and 12–13px supporting UI; a compact 20px page heading.
- Main order: task summary, analysis/watch/organize actions, scope/filter/search, status-sorted rows. One filled primary action per view.
- Rows share one list surface. Full titles wrap, details expose the full URL, and metadata remains secondary.
- Settings divide model connection, usage and native features. Native features remain independent of API configuration.
- 侧栏明暗主题由 `extension/ui.css` 的语义变量控制。主操作用石墨色或反白，琥珀色用于关闭提醒，红色用于错误和破坏性操作。
- 对话设置使用统一的页边距、独立的标题与说明行和安静的分隔线。窄窗口的长下拉项移到其说明下方。
- 对话大纲的搜索区与标题共用 16px 横向留白，图标沿用同一组线条。索引未覆盖完整会话时，在大纲底部显示已载入范围。
- 缩放概览保留 ChatGPT 页面主题。正文沿阅读位置收拢，问句仍在右侧，回答和章节仍在左侧。模型摘要覆盖对话目的、关键决定和未决事项。主题导航锚定原轮次，模型结果到达时保留正在阅读的问答。 手势与收尾动画按帧推进，概览稳定后继续补齐历史、应用主题。反向捏合恢复原阅读位置。
- macOS 标签切换器使用系统 Liquid Glass，选中行用中性明暗和勾号提示。
- 控件用原生语义与一致的可见焦点。按压和悬停反馈约 110 ms，侧栏设置切换与内容确认约 165 ms。捏合和窗口跟随直接响应输入，可反向中断。遵循系统减少动态效果。
- 管理事项只列需要接手的页面。需要选择时，通过网页检查打开临时范围清单。跟踪、模型传输和关闭资格各按自己的条件判断。
- 模型连接将 OpenAI 地址与密钥放在同一服务下，兼容服务才需要自定义地址。新设备收到加密连接时显示一次通行密钥恢复入口。
- Mac 助手只显示当前可执行的设置动作。系统授权结果在返回时刷新。切换器预留标记宽度，浮标遮挡时立即隐藏，倒计时以可见时长为准。
- Long values wrap. Minimum reviewed CSS width is 320px. The current requested browser side panel is also reviewed at 380px.
- Countdown rings represent actual time. They include a visible status and a distinct keep action.
- HTTP previews use explicit synthetic labels and never make API calls or control real tabs.

## 2026-11-08 identity refinement

The Chrome extension name is simply **Tab Pilot**. The original vector mark uses two overlapping tabs and a forward arrow on a forest-green tile, with explicit 16/32/48/128-pixel toolbar exports. The header uses the same SVG source. Settings uses the Lucide gear, with upstream license retained in the extension. Native close controls say “保留” instead of using a pause symbol for cancellation. Actual AppKit render references live in `docs/assets/native-overlays/`; they do not stand in for desktop acceptance.

## 2026-11-10 native semantic colors

The user approved the thin continuous pointer shape. The first gray/earthy low-chroma palette was rejected as muddy and not cute. The user confirmed the clear, luminous cream-pastel direction on 2026-11-10: mint completion, vanilla closing, peach pink at the final five visible seconds, and sky-blue pause. Keep the saturation soft while removing gray/brown from the surfaces. In dark appearance use slightly deeper luminous pastel fills with dark ink, so indicators remain visible against Chrome. Status text remains present; no flashing or animation is added.

| Role | Aqua surface / ink | Dark Aqua surface / ink |
| --- | --- | --- |
| Ready | #DAF5E8 / #275E50 | #BFE9D6 / #204E40 |
| Closing | #FFF2CF / #725618 | #F4DFA8 / #614916 |
| Closing, ≤5 seconds | #FFE4E9 / #8D3E50 | #F4CCD6 / #773246 |
| Paused | #E0F1FF / #345E81 | #CBE3F8 / #2C506F |

The palettes live together in native `OverlayPalette`. Surfaces are opaque and all text/background pairs are measured. Geometry, visibility accounting, credentials and API behavior are unchanged. Current actual AppKit references and contrast calculations live under docs/assets/native-overlays/pastel/. The approved colors are installed in helper 0.4.2 with source/signature, permission, protocol and Chrome-reconnection proof. New full physical journeys remain separate.

## 0.5.0 自动分析与恢复界面

“自动分析”是工作区唯一填色主操作，监听和整理为次级操作。运行卡只显示进度、当前页、处理统计和暂停/继续，不增加总览大卡或宣传文案。网站范围使用原生复选框，页数随选择更新，未选网站时禁用开始。授权预览明确数据类型、目的地址和可选的持续复查。

连接恢复操作紧邻密钥状态。暂时无法读取时提示“解锁并恢复连接”，不要求重新导入；只有实际保存或恢复成功才显示钥匙串已保存。导入值不进入 DOM，设置页只显示占位状态。320/380px、键盘焦点与 Escape 返回的合成预览已验收，截图位于 docs/assets/workspace/0.5.0/。
