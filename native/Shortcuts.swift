import AppKit
import ApplicationServices
import Carbon
import QuartzCore

// The tap is attached to Chrome's PID, never to the global HID/session stream.
struct ShortcutKeyState {
    enum Action: Equatable {case step(Int,Int),end(Int,Bool)}
    var token:Int?;var nextToken=0;var tabHeld=false;var escapeHeld=false
    mutating func finish(cancel:Bool)->Action? {guard let t=token else{return nil};token=nil;return .end(t,cancel)}
    mutating func key(_ key:Int,down:Bool,control:Bool,shift:Bool,otherModifier:Bool,allowed:Bool)->(Bool,Action?) {
        if key==48 && !down && tabHeld {tabHeld=false;return(true,nil)}
        if key==53 && !down && escapeHeld {escapeHeld=false;return(true,nil)}
        guard down else{return(false,nil)}
        if key==53,token != nil {escapeHeld=true;return(true,finish(cancel:true))}
        guard key==48 && control && !otherModifier && allowed else{return(false,nil)}
        if token==nil {nextToken+=1;token=nextToken};tabHeld=true
        return(true,.step(token!,shift ? -1 : 1))
    }
}
struct ShortcutContext:Decodable {let windowId:Int;let activeId:Int;let count:Int;let window:TabTarget.Bounds}
struct SwitcherPreview:Decodable {
    struct Item: Decodable {
        let id: Int
        let title: String
        let site: String
        let kind: String?
        let icon: String?
    }
    let gesture:Int;let selectedId:Int;let index:Int;let total:Int;let items:[Item]
}
final class ChromeShortcuts {
    let send:([String:Any])->Void
    var context:ShortcutContext?;var enabled=false;var tap:CFMachPort?;var source:CFRunLoopSource?;var chromePID:pid_t=0
    var state=ShortcutKeyState();var panel:NSPanel?;var timeout:Timer?;var focusObserver:NSObjectProtocol?
    init(send:@escaping([String:Any])->Void){self.send=send
        focusObserver=NSWorkspace.shared.notificationCenter.addObserver(forName:NSWorkspace.didActivateApplicationNotification,object:nil,queue:.main){[weak self] _ in
            guard let self=self,NSWorkspace.shared.frontmostApplication?.processIdentifier != self.chromePID else{return};self.end(cancel:false)
        }
    }
    deinit{stop();if let o=focusObserver {NSWorkspace.shared.notificationCenter.removeObserver(o)}}
    func report(_ status:String,_ reason:String){send(["type":"mruStatus","status":status,"reason":reason])}
    func configure(_ object:[String:Any]) {
        guard object["enabled"] as? Bool==true else{enabled=false;context=nil;end(cancel:false);stop();report("disabled","尚未启用。");return}
        enabled=true
        var next:ShortcutContext?
        if let raw=object["context"] as? [String:Any],let data=try? JSONSerialization.data(withJSONObject:raw),let decoded=try? JSONDecoder().decode(ShortcutContext.self,from:data),decoded.count>=2,decoded.window.rect.width>=200,decoded.window.rect.height>=150 {next=decoded}
        if context?.windowId != next?.windowId {end(cancel:false)};context=next
        guard AXIsProcessTrusted() else{stop();report("accessibility_required","快捷切换需要辅助功能授权；在系统设置中启用当前 Mac 助手，再试一次。");return}
        guard let process=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first else{stop();report("chrome_not_running","打开 Chrome 后重新保存快捷切换设置。");return}
        if tap==nil || chromePID != process.processIdentifier {
            stop();chromePID=process.processIdentifier
            let mask=[CGEventType.keyDown,.keyUp,.flagsChanged,.leftMouseDown,.rightMouseDown].reduce(CGEventMask(0)){$0 | (CGEventMask(1)<<$1.rawValue)}
            let callback:CGEventTapCallBack={_,type,event,info in
                guard let info=info else{return Unmanaged.passUnretained(event)}
                return Unmanaged<ChromeShortcuts>.fromOpaque(info).takeUnretainedValue().handle(type,event)
            }
            guard let port=CGEvent.tapCreateForPid(pid:chromePID,place:.headInsertEventTap,options:.defaultTap,eventsOfInterest:mask,callback:callback,userInfo:Unmanaged.passUnretained(self).toOpaque()) else{report("permission_required","macOS 尚未允许接管快捷键；检查 Mac 助手的辅助功能授权，再试一次。");return}
            tap=port;source=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,port,0)
            if let s=source {CFRunLoopAddSource(CFRunLoopGetMain(),s,.commonModes)}
            CGEvent.tapEnable(tap:port,enable:true)
        }
        report("ready",context==nil ? "已连接；当前普通窗口有两个标签后即可使用 ⌃ Tab。" : "已启用：⌃ Tab 按最近使用切换，松开 Control 确认。")
    }
    func stop(){if let t=tap {CGEvent.tapEnable(tap:t,enable:false);CFMachPortInvalidate(t)};if let s=source {CFRunLoopRemoveSource(CFRunLoopGetMain(),s,.commonModes)};tap=nil;source=nil;panel?.orderOut(nil);timeout?.invalidate();timeout=nil}
    func focusedWindowMatches()->Bool {
        guard let c=context,NSWorkspace.shared.frontmostApplication?.processIdentifier==chromePID,!IsSecureEventInputEnabled() else{return false}
        let app=AXUIElementCreateApplication(chromePID);AXUIElementSetMessagingTimeout(app,0.02)
        guard let raw=attr(app,kAXFocusedWindowAttribute),CFGetTypeID(raw)==AXUIElementGetTypeID() else{return false}
        let window=unsafeBitCast(raw,to:AXUIElement.self);AXUIElementSetMessagingTimeout(window,0.02)
        guard textAttr(window,kAXRoleAttribute)=="AXWindow",textAttr(window,kAXSubroleAttribute)=="AXStandardWindow",attr(window,kAXModalAttribute) as? Bool != true,!(attr(window,kAXChildrenAttribute) as? [AXUIElement] ?? []).contains(where:{textAttr($0,kAXRoleAttribute)=="AXSheet"}),attr(window,kAXMinimizedAttribute) as? Bool != true,let rect=elementRect(window) else{return false}
        return sameWindow(rect,c.window.rect)
    }
    func handle(_ type:CGEventType,_ event:CGEvent)->Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {end(cancel:false);stop();report("paused","快捷键接管已暂停；在 Tab Cadence 的 Mac 设置中重新连接。");return Unmanaged.passUnretained(event)}
        if type == .flagsChanged {if !event.flags.contains(.maskControl){end(cancel:false)};return Unmanaged.passUnretained(event)}
        if type == .leftMouseDown || type == .rightMouseDown {end(cancel:false);return Unmanaged.passUnretained(event)}
        // Do not read Unicode characters or record general keystrokes.
        let key=Int(event.getIntegerValueField(.keyboardEventKeycode));guard key==48 || key==53 else{return Unmanaged.passUnretained(event)}
        let control=event.flags.contains(.maskControl),shift=event.flags.contains(.maskShift)
        let other=event.flags.contains(.maskCommand)||event.flags.contains(.maskAlternate)
        let allowed=enabled && context != nil && NSWorkspace.shared.frontmostApplication?.processIdentifier==chromePID && !IsSecureEventInputEnabled() && (state.token != nil || focusedWindowMatches())
        let outcome=state.key(key,down:type == .keyDown,control:control,shift:shift,otherModifier:other,allowed:allowed)
        if let action=outcome.1 {dispatch(action)}
        return outcome.0 ? nil : Unmanaged.passUnretained(event)
    }
    func dispatch(_ action:ShortcutKeyState.Action){
        switch action {
        case .step(let token,let direction):
            guard let c=context else{return};send(["type":"mruStep","gesture":token,"windowId":c.windowId,"direction":direction])
            timeout?.invalidate();timeout=Timer.scheduledTimer(withTimeInterval:15,repeats:false){[weak self]_ in self?.end(cancel:false)}
        case .end(let token,let cancelled):panel?.orderOut(nil);timeout?.invalidate();timeout=nil;send(["type":"mruEnd","gesture":token,"cancelled":cancelled])
        }
    }
    func end(cancel:Bool){if let a=state.finish(cancel:cancel){dispatch(a)}else{panel?.orderOut(nil)}}
    func dismiss(){end(cancel:false)}
    func preview(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let value = try? JSONDecoder().decode(SwitcherPreview.self, from: data),
              value.gesture == state.token, let context, !value.items.isEmpty, value.items.count <= 9,
              NSWorkspace.shared.frontmostApplication?.processIdentifier == chromePID else { return }

        if panel == nil {
            let window = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
                                 backing: .buffered, defer: false)
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = true
            window.level = .floating
            window.ignoresMouseEvents = true
            window.animationBehavior = .none
            window.collectionBehavior = [.fullScreenAuxiliary, .transient]
            window.contentView = SwitcherContent()
            panel = window
        }
        guard let panel, let content = panel.contentView as? SwitcherContent else { return }

        let primaryTop = NSScreen.screens.first?.frame.maxY ?? 0
        let chrome = context.window.rect
        let center = CGPoint(x: chrome.midX, y: primaryTop - chrome.midY)
        let screen = NSScreen.screens.first { $0.frame.contains(center) } ?? NSScreen.main
        let visible = screen?.visibleFrame ?? CGRect(x: 0, y: 0, width: 1440, height: 900)
        let width = min(396, chrome.width - 20, visible.width - 32)
        let height = content.apply(value, width: width, availableHeight: visible.height - 32,
                                   animateSelection: panel.isVisible)
        let rect = CGRect(
            x: min(max(center.x - width / 2, visible.minX + 16), visible.maxX - width - 16),
            y: min(max(center.y - height / 2, visible.minY + 16), visible.maxY - height - 16),
            width: width, height: height
        ).integral
        if panel.frame != rect { panel.setFrame(rect, display: true) }
        NativeMotion.reveal(panel, animated: true)
    }
}

enum NativeColors {
    static let secondaryLabel = NSColor(name: nil) { appearance in
        let dark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return NSColor(srgbRed: dark ? 0.73 : 0.34, green: dark ? 0.73 : 0.34,
                       blue: dark ? 0.73 : 0.34, alpha: 1)
    }
}

enum NativeMotion {
    static let feedbackDuration: CFTimeInterval = 0.12
    static let presentationDuration: CFTimeInterval = 0.16
    static let easing = CAMediaTimingFunction(controlPoints: 0.2, 0.8, 0.2, 1)
    static var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    static func tint(_ layer: CALayer, opacity: Float, animated: Bool = true) {
        let animate = animated && !reduced
        let animationKey = "feedback"
        if layer.opacity == opacity && (animate || layer.animation(forKey: animationKey) == nil) { return }
        let previous = layer.presentation()?.opacity ?? layer.opacity
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.opacity = opacity
        layer.removeAnimation(forKey: animationKey)
        if animate && previous != opacity {
            let animation = CABasicAnimation(keyPath: "opacity")
            animation.fromValue = previous
            animation.toValue = opacity
            animation.duration = feedbackDuration
            animation.timingFunction = easing
            layer.add(animation, forKey: animationKey)
        }
        CATransaction.commit()
    }

    static func reveal(_ panel: NSPanel, animated: Bool) {
        guard !panel.isVisible else { return }
        let animate = animated && !reduced
        panel.alphaValue = animate ? 0.88 : 1
        panel.orderFrontRegardless()
        if animate {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = presentationDuration
                context.timingFunction = easing
                panel.animator().alphaValue = 1
            }
        }
    }
}

// 按住 Control 时复用一个原生浮层，保留仍在可见范围内的同一标签行。
final class SwitcherContent: NSView {
    private static let rowHeight: CGFloat = 43
    private static let headerHeight: CGFloat = 46
    private static let footerHeight: CGFloat = 35

    private final class Foreground: NSView {
        override var isFlipped: Bool { true }
    }

    private let foreground = Foreground()
    private let heading = NSTextField(labelWithString: "切换标签")
    private let position = NSTextField(labelWithString: "")
    private let footer = NSTextField(labelWithString: "")
    private let rule = NSBox()
    private var rows: [Int: Row] = [:]

    init() {
        super.init(frame: .zero)
        let material: NSView
        if #available(macOS 26, *) {
            let glass = NSGlassEffectView()
            glass.style = .regular
            glass.cornerRadius = 20
            glass.contentView = foreground
            material = glass
        } else {
            let blur = NSVisualEffectView()
            blur.material = .popover
            blur.blendingMode = .behindWindow
            blur.state = .active
            blur.wantsLayer = true
            blur.layer?.cornerRadius = 20
            blur.layer?.cornerCurve = .continuous
            blur.layer?.masksToBounds = true
            foreground.frame = blur.bounds
            foreground.autoresizingMask = [.width, .height]
            blur.addSubview(foreground)
            material = blur
        }
        material.frame = bounds
        material.autoresizingMask = [.width, .height]
        addSubview(material)

        heading.font = .systemFont(ofSize: 14, weight: .semibold)
        position.font = .monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        position.textColor = NativeColors.secondaryLabel
        position.alignment = .right
        position.setAccessibilityLabel("选择位置")
        footer.font = .systemFont(ofSize: 11, weight: .medium)
        footer.textColor = NativeColors.secondaryLabel
        footer.lineBreakMode = .byTruncatingTail
        rule.boxType = .separator
        for view in [heading, position, rule, footer] { foreground.addSubview(view) }
        setAccessibilityRole(.group)
        setAccessibilityLabel("最近使用的 Chrome 标签")
    }

    required init?(coder: NSCoder) { nil }

    @discardableResult
    func apply(_ value: SwitcherPreview, width: CGFloat, availableHeight: CGFloat,
               animateSelection: Bool) -> CGFloat {
        let space = availableHeight - Self.headerHeight - Self.footerHeight
        let capacity = min(6, value.items.count, max(1, Int(space / Self.rowHeight)))
        let selected = value.items.firstIndex { $0.id == value.selectedId } ?? 0
        let start = min(max(selected - capacity / 2, 0), value.items.count - capacity)
        let items = Array(value.items[start..<(start + capacity)])
        let height = Self.headerHeight + CGFloat(capacity) * Self.rowHeight + Self.footerHeight
        frame.size = NSSize(width: width, height: height)

        heading.frame = NSRect(x: 17, y: 14, width: width - 108, height: 18)
        position.frame = NSRect(x: width - 94, y: 16, width: 77, height: 15)
        position.stringValue = "\(value.index) / \(value.total)"
        position.setAccessibilityValue("第 \(value.index) 个，共 \(value.total) 个标签")
        rule.frame = NSRect(x: 17, y: height - Self.footerHeight + 3, width: width - 34, height: 1)
        footer.frame = NSRect(x: 17, y: height - 24, width: width - 34, height: 15)
        footer.stringValue = width >= 308 ? "松开 Control 确认 · Shift 反向 · Esc 取消" : "松开 ⌃ 确认 · ⇧ 反向 · Esc 取消"

        let visibleIDs = Set(items.map(\.id))
        for id in rows.keys.filter({ !visibleIDs.contains($0) }) {
            rows.removeValue(forKey: id)?.removeFromSuperview()
        }
        var accessibilityRows: [NSView] = []
        for (index, item) in items.enumerated() {
            let row: Row
            let existing = rows[item.id]
            if let existing {
                row = existing
            } else {
                row = Row()
                rows[item.id] = row
                foreground.addSubview(row)
            }
            row.frame = NSRect(x: 9, y: Self.headerHeight + CGFloat(index) * Self.rowHeight,
                               width: width - 18, height: Self.rowHeight - 2)
            row.apply(item, selected: item.id == value.selectedId, animate: animateSelection && existing != nil)
            accessibilityRows.append(row)
        }
        setAccessibilityChildren([heading, position] + accessibilityRows + [footer])
        return height
    }

    func verifySelection(_ id: Int) -> (visible: Bool, titleWidth: CGFloat) {
        (rows[id]?.selected == true, rows[id]?.titleWidth ?? 0)
    }

    private final class Row: NSView {
        private let selection = NSView()
        private let iconTile = NSView()
        private let icon = NSImageView()
        private let title = NSTextField(labelWithString: "")
        private let site = NSTextField(labelWithString: "")
        private let marker = NSImageView()
        private var lastIcon: String?
        private var lastKind: String?
        private(set) var selected = false
        var titleWidth: CGFloat { title.frame.width }
        override var isFlipped: Bool { true }

        init() {
            super.init(frame: .zero)
            selection.wantsLayer = true
            selection.layer?.cornerRadius = 10
            selection.layer?.cornerCurve = .continuous
            selection.layer?.opacity = 0
            iconTile.wantsLayer = true
            iconTile.layer?.cornerRadius = 6
            icon.imageScaling = .scaleProportionallyDown
            marker.image = Self.symbol("checkmark", size: 11)
            marker.contentTintColor = .labelColor
            title.font = .systemFont(ofSize: 13, weight: .medium)
            site.font = .systemFont(ofSize: 11)
            site.textColor = NativeColors.secondaryLabel
            for field in [title, site] {
                field.maximumNumberOfLines = 1
                field.lineBreakMode = .byTruncatingTail
                field.setAccessibilityElement(false)
            }
            for view in [selection, iconTile, icon, title, site, marker] { addSubview(view) }
            setAccessibilityElement(true)
            setAccessibilityRole(.row)
            updateAppearance()
        }

        required init?(coder: NSCoder) { nil }

        override func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            updateAppearance()
        }

        private func updateAppearance() {
            let dark = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let tint: NSColor = dark ? .white : .black
            selection.layer?.backgroundColor = tint.withAlphaComponent(dark ? 0.18 : 0.10).cgColor
            iconTile.layer?.backgroundColor = tint.withAlphaComponent(dark ? 0.08 : 0.05).cgColor
        }

        func apply(_ item: SwitcherPreview.Item, selected: Bool, animate: Bool) {
            if icon.image == nil || lastIcon != item.icon || lastKind != item.kind {
                lastIcon = item.icon
                lastKind = item.kind
                let names = ["extensions": "puzzlepiece.extension", "settings": "gearshape",
                             "history": "clock.arrow.circlepath", "downloads": "arrow.down.circle",
                             "bookmarks": "bookmark", "browser": "macwindow", "file": "doc"]
                icon.image = item.icon.flatMap(Self.favicon) ?? Self.symbol(names[item.kind ?? ""] ?? "globe", size: 14)
                icon.contentTintColor = .secondaryLabelColor
            }
            title.stringValue = item.title
            site.stringValue = item.site
            site.isHidden = item.site.isEmpty
            marker.isHidden = !selected
            if let layer = selection.layer {
                NativeMotion.tint(layer, opacity: selected ? 1 : 0, animated: animate)
            }
            selection.frame = bounds
            iconTile.frame = NSRect(x: 8, y: 7, width: 26, height: 26)
            icon.frame = NSRect(x: 12, y: 11, width: 18, height: 18)
            let width = max(0, bounds.width - 72)
            title.frame = NSRect(x: 43, y: site.isHidden ? 12 : 5, width: width, height: 17)
            site.frame = NSRect(x: 43, y: 22, width: width, height: 14)
            marker.frame = NSRect(x: bounds.width - 24, y: 13, width: 14, height: 14)
            setAccessibilityLabel([item.title, item.site].filter { !$0.isEmpty }.joined(separator: "，"))
            if self.selected != selected {
                self.selected = selected
                setAccessibilitySelected(selected)
            }
        }

        private static func symbol(_ name: String, size: CGFloat) -> NSImage? {
            NSImage(systemSymbolName: name, accessibilityDescription: nil)?
                .withSymbolConfiguration(.init(pointSize: size, weight: .medium))
        }

        private static func favicon(_ data: String) -> NSImage? {
            guard data.utf8.count <= 4096,
                  let bytes = Data(base64Encoded: data),
                  bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]),
                  let image = NSImage(data: bytes), image.size.width > 0, image.size.height > 0,
                  image.size.width <= 64, image.size.height <= 64 else { return nil }
            return image
        }
    }
}
func shortcutSelfTest() throws {
    enum Failure:Error {case state}
    func require(_ value:Bool)throws{if !value{throw Failure.state}}
    var state=ShortcutKeyState()
    try require(state.key(48,down:true,control:true,shift:false,otherModifier:false,allowed:false).0==false)
    let first=state.key(48,down:true,control:true,shift:false,otherModifier:false,allowed:true);try require(first.0 && first.1 == .step(1,1))
    try require(state.key(48,down:false,control:true,shift:false,otherModifier:false,allowed:true).0)
    try require(state.key(48,down:true,control:true,shift:true,otherModifier:false,allowed:true).1 == .step(1,-1))
    try require(state.finish(cancel:false) == .end(1,false))
    try require(state.key(48,down:false,control:false,shift:false,otherModifier:false,allowed:true).0)
    try require(state.key(48,down:true,control:true,shift:false,otherModifier:true,allowed:true).0==false)
    _=state.key(48,down:true,control:true,shift:false,otherModifier:false,allowed:true)
    try require(state.key(53,down:true,control:true,shift:false,otherModifier:false,allowed:true).1 == .end(2,true))
    try require(state.key(53,down:false,control:true,shift:false,otherModifier:false,allowed:true).0)
    try require(state.key(0,down:true,control:true,shift:false,otherModifier:false,allowed:true).0==false)
}
func verifySwitcherPresentation(renderingTo directory: URL? = nil) throws {
    let examples = [
        SwitcherPreview.Item(id: 1, title: "Chrome 扩展开发文档", site: "developer.chrome.com", kind: "web", icon: nil),
        .init(id: 2, title: "会话大纲和主题分组的界面验收", site: "chatgpt.com", kind: "web", icon: nil),
        .init(id: 3, title: "扩展程序", site: "", kind: "extensions", icon: nil),
        .init(id: 4, title: "较长的文章标题在空间不足时保持原来的截断位置", site: "example.org", kind: "web", icon: nil),
        .init(id: 5, title: "打开的文稿", site: "", kind: "file", icon: nil),
        .init(id: 6, title: "下载内容", site: "", kind: "downloads", icon: nil),
        .init(id: 7, title: "标签提醒验收", site: "example.com", kind: "web", icon: nil),
    ]
    let cases: [(String, NSAppearance.Name, CGFloat, CGFloat)] = [
        ("light", .aqua, 396, 400), ("dark", .darkAqua, 396, 400), ("compact", .aqua, 220, 205),
    ]
    if let directory { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }

    for (name, appearanceName, width, availableHeight) in cases {
        guard let appearance = NSAppearance(named: appearanceName) else { throw CocoaError(.featureUnsupported) }
        let content = SwitcherContent()
        content.appearance = appearance
        let history = [2, 3, 4, 5, 6, 7, 6, 3, 2, 1]
        var timings: [Double] = []
        var titleWidth: CGFloat?
        for index in Array(repeating: history, count: 4).flatMap({ $0 }) {
            let start = ProcessInfo.processInfo.systemUptime
            let value = SwitcherPreview(gesture: 1, selectedId: index, index: index, total: 7, items: examples)
            let height = content.apply(value, width: width, availableHeight: availableHeight, animateSelection: true)
            content.layoutSubtreeIfNeeded()
            timings.append((ProcessInfo.processInfo.systemUptime - start) * 1000)
            let selection = content.verifySelection(index)
            guard height <= availableHeight, selection.visible, selection.titleWidth > 0,
                  titleWidth == nil || selection.titleWidth == titleWidth else { throw CocoaError(.validationMultipleErrors) }
            titleWidth = selection.titleWidth
        }
        guard let directory else { continue }
        let value = SwitcherPreview(gesture: 1, selectedId: 3, index: 3, total: 7, items: examples)
        content.apply(value, width: width, availableHeight: availableHeight, animateSelection: false)
        content.layoutSubtreeIfNeeded()
        let size = content.bounds.size
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * 2),
                                           pixelsHigh: Int(size.height * 2), bitsPerSample: 8, samplesPerPixel: 4,
                                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                           bytesPerRow: 0, bitsPerPixel: 0) else { throw CocoaError(.fileWriteUnknown) }
        bitmap.size = size
        appearance.performAsCurrentDrawingAppearance {
            let backing = NSView(frame: content.bounds)
            backing.appearance = appearance
            backing.wantsLayer = true
            backing.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
            backing.addSubview(content)
            backing.cacheDisplay(in: backing.bounds, to: bitmap)
        }
        guard let data = bitmap.representation(using: .png, properties: [:]) else { throw CocoaError(.fileWriteUnknown) }
        try data.write(to: directory.appendingPathComponent(name + ".png"))

        let sorted = timings.sorted()
        let p95 = sorted[Int(Double(sorted.count - 1) * 0.95)]
        print("Switcher \(name) \(timings.count) layout updates; p95 \(String(format: "%.2f", p95)) ms.")
    }
}
