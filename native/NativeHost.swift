import AppKit
import ApplicationServices
import QuartzCore

func attr(_ e:AXUIElement,_ key:String)->CFTypeRef? {var value:CFTypeRef?;return AXUIElementCopyAttributeValue(e,key as CFString,&value) == .success ? value : nil}
func textAttr(_ e:AXUIElement,_ key:String)->String {attr(e,key) as? String ?? ""}
func elementRect(_ e:AXUIElement)->CGRect? {
    guard let p=attr(e,kAXPositionAttribute),let s=attr(e,kAXSizeAttribute),CFGetTypeID(p)==AXValueGetTypeID(),CFGetTypeID(s)==AXValueGetTypeID() else{return nil}
    var point=CGPoint.zero;var size=CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p,to:AXValue.self),.cgPoint,&point),AXValueGetValue(unsafeBitCast(s,to:AXValue.self),.cgSize,&size) else{return nil}
    return CGRect(origin:point,size:size)
}
private let usesChinese = Locale.preferredLanguages.first?.lowercased().hasPrefix("zh") == true

func nativeCopy(_ chinese: String, _ english: String) -> String {
    usesChinese ? chinese : english
}

// 用户从设置明确发起时，由实际运行的助手向系统请求自己的权限。
@discardableResult
private func requestBridgeAccessibility() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if AXIsProcessTrustedWithOptions(options) { return true }
    return NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
}

final class BrowserGeometry {
    var heldWindow:AXUIElement?
    func reset(){heldWindow=nil}
    func locate(_ target:TabTarget,foreground:Bool=true) -> (status:String,tab:NativeTab?,window:CGRect?,vertical:Bool) {
        guard AXIsProcessTrusted() else{return("accessibility_required",nil,nil,false)}
        guard let process=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first else{return("chrome_not_running",nil,nil,false)}
        if foreground && NSWorkspace.shared.frontmostApplication?.bundleIdentifier != "com.google.Chrome" {return("chrome_not_frontmost",nil,nil,false)}
        let app=AXUIElementCreateApplication(process.processIdentifier)
        let windows=attr(app,kAXWindowsAttribute) as? [AXUIElement] ?? []
        // AXWindows can temporarily omit a valid window while Chrome moves into a fullscreen Space.
        // Keep the same AX identity until it becomes invalid; focused-window validation below still fails closed.
        if let held=heldWindow,elementRect(held)==nil {heldWindow=nil}
        if heldWindow==nil {
            let candidates=windows.filter{elementRect($0).map{sameWindow($0,target.window.rect)} ?? false}
            guard candidates.count==1 else{return("window_not_matched",nil,nil,false)}
            heldWindow=candidates[0]
        }
        guard let window=heldWindow,let frame=elementRect(window) else{return("window_not_matched",nil,nil,false)}
        if attr(window,kAXMinimizedAttribute) as? Bool == true {return("window_minimized",nil,frame,false)}
        if foreground {guard let front=attr(app,kAXFocusedWindowAttribute),CFEqual(front,window) else{return("window_not_frontmost",nil,frame,false)}}
        var tabs:[NativeTab]=[];var visited=0
        func walk(_ e:AXUIElement,_ depth:Int,_ clip:CGRect,_ inTabs:Bool){
            guard depth<24,visited<5000 else{return};visited+=1
            let role=textAttr(e,kAXRoleAttribute)
            if role=="AXWebArea" || role=="AXMenuBar" || role=="AXMenu" {return}
            let tabGroup=inTabs || role=="AXTabGroup"
            var nextClip=clip
            if ["AXScrollArea","AXTabGroup"].contains(role),let r=elementRect(e),!r.isEmpty {nextClip=clip.intersection(r)}
            if tabGroup && ["AXRadioButton","AXTab"].contains(role),let r=elementRect(e){tabs.append(NativeTab(label:textAttr(e,kAXTitleAttribute),rect:r,clip:nextClip))}
            for child in attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? [] {walk(child,depth+1,nextClip,tabGroup)}
        }
        walk(window,0,frame,false)
        switch matchTab(target,tabs:tabs){case .failure(let e):return(e.rawValue,nil,frame,false)
        case .success(let tab):
            // Native horizontal tabs live above the main toolbar; vertical ones share a leading column.
            let vertical=isVerticalTab(tab,window:frame,tabs:tabs)
            return("mapped",tab,frame,vertical)
        }
    }
}
// 浮标使用不透明的柔和状态色，让浏览器背景变化时文字依然清晰。
struct OverlayPalette {
    let surface:NSColor
    let ink:NSColor
    let border:NSColor
    static func color(_ hex:UInt32)->NSColor {
        NSColor(srgbRed:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:1)
    }
    static func resolve(kind:String,paused:Bool,seconds:Int,appearance:NSAppearance)->OverlayPalette {
        let dark=appearance.bestMatch(from:[.aqua,.darkAqua]) == .darkAqua
        let values:(UInt32,UInt32,UInt32)
        if kind != "countdown" {
            values=dark ? (0xC5EADB,0x205445,0x93BEAA):(0xDDF5EB,0x25594E,0xA8D6C4)
        }else if paused {
            values=dark ? (0xDACDF8,0x402D63,0xA98FC8):(0xEDE6FA,0x4A386C,0xC8B6E5)
        }else if seconds<=5 {
            values=dark ? (0xF2C6D1,0x722F47,0xCD8FA4):(0xFCE4EC,0x81364F,0xE4AEC1)
        }else{
            values=dark ? (0xF0DAB8,0x634323,0xC5A275):(0xFCEDD8,0x714B29,0xDEBC94)
        }
        return OverlayPalette(surface:color(values.0),ink:color(values.1),border:color(values.2))
    }
    func textContrast(overlayAlpha:CGFloat=0)->Double {
        let background=surface.usingColorSpace(.sRGB)!,foreground=ink.usingColorSpace(.sRGB)!
        func linear(_ v:CGFloat)->Double {let x=Double(v);return x<=0.04045 ? x/12.92:pow((x+0.055)/1.055,2.4)}
        func luminance(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat)->Double {0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b)}
        let bg=luminance(background.redComponent*(1-overlayAlpha)+foreground.redComponent*overlayAlpha,background.greenComponent*(1-overlayAlpha)+foreground.greenComponent*overlayAlpha,background.blueComponent*(1-overlayAlpha)+foreground.blueComponent*overlayAlpha)
        let fg=luminance(foreground.redComponent,foreground.greenComponent,foreground.blueComponent)
        return (max(fg,bg)+0.05)/(min(fg,bg)+0.05)
    }
}
final class OverlayKeepButton: NSButton {
    private let tint = CALayer()
    private var hovered = false
    private var tracking: NSTrackingArea?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        tint.cornerRadius = 4
        tint.opacity = 0
        layer?.addSublayer(tint)
    }

    required init?(coder: NSCoder) { nil }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(area)
        tracking = area
        super.updateTrackingAreas()
    }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        tint.frame = bounds.insetBy(dx: 0.5, dy: 1)
        CATransaction.commit()
    }

    override func mouseEntered(with event: NSEvent) {
        hovered = true
        updateTint()
    }

    override func mouseExited(with event: NSEvent) {
        hovered = false
        updateTint()
    }

    override func highlight(_ flag: Bool) {
        super.highlight(flag)
        updateTint()
    }

    func setTint(_ color: NSColor) {
        contentTintColor = color
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        tint.backgroundColor = color.cgColor
        CATransaction.commit()
    }

    func resetTint() {
        hovered = false
        NativeMotion.tint(tint, opacity: 0, animated: false)
    }

    private func updateTint() {
        NativeMotion.tint(tint, opacity: isHighlighted ? 0.12 : hovered ? 0.055 : 0)
    }
}
final class OverlayView:NSView {
    var vertical = false {
        didSet {
            guard oldValue != vertical else { return }
            needsDisplay = true
            needsLayout = true
        }
    }
    var anchorOffset: CGFloat? {
        didSet { if oldValue != anchorOffset { needsDisplay = true } }
    }
    private(set) var kind = "resume"
    private var closeAt = Date.distantPast
    private var paused = false
    private var remaining: Double = 30
    var onHover: ((Bool) -> Void)?
    var onPardon: (() -> Void)?
    private var area: NSTrackingArea?
    private var inside = false
    private var lastPaintedSecond: Int?
    private lazy var keepButton: OverlayKeepButton = {
        let button = OverlayKeepButton(frame: .zero)
        button.title = nativeCopy("保留", "Keep")
        button.target = self
        button.action = #selector(keep)
        button.font = .systemFont(ofSize: 11.5, weight: .medium)
        button.isBordered = false
        button.toolTip = nativeCopy("保留此页，取消本次关闭", "Keep this tab open")
        button.setAccessibilityLabel(nativeCopy("保留此页，取消本次关闭", "Keep this tab open"))
        button.isHidden = true
        return button
    }()

    private var secondsRemaining: Int {
        let seconds = paused ? remaining : closeAt.timeIntervalSinceNow
        return Int(ceil(min(max(seconds, 0), 30)))
    }
    private var palette: OverlayPalette {
        OverlayPalette.resolve(kind: kind, paused: paused, seconds: secondsRemaining, appearance: effectiveAppearance)
    }

    private func updatePalette() {
        let ink = palette.ink
        guard keepButton.contentTintColor != ink else { return }
        keepButton.setTint(ink)
        keepButton.attributedTitle = NSAttributedString(string: nativeCopy("保留", "Keep"), attributes: [
            .font: NSFont.systemFont(ofSize: 11.5, weight: .medium), .foregroundColor: ink,
        ])
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updatePalette()
        needsDisplay = true
    }

    override var isFlipped: Bool { true }

    override init(frame: NSRect) {
        super.init(frame: frame)
        addSubview(keepButton)
        setAccessibilityRole(.group)
        setAccessibilityLabel(nativeCopy("可以继续了", "Ready"))
    }

    required init?(coder: NSCoder) { nil }

    @objc private func keep() { onPardon?() }

    private func setPointerInside(_ entered: Bool) {
        let next = kind == "countdown" && entered
        guard next != inside else { return }
        inside = next
        onHover?(next)
    }

    func resetInteraction() {
        setPointerInside(false)
        keepButton.resetTint()
    }

    func updatePointer(at pointInWindow: NSPoint) {
        setPointerInside(bounds.contains(convert(pointInWindow, from: nil)))
    }

    override func updateTrackingAreas() {
        if let area { removeTrackingArea(area) }
        let next = NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(next)
        area = next
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) { setPointerInside(true) }
    override func mouseExited(with event: NSEvent) { setPointerInside(false) }

    func update(_ object: [String: Any]?) {
        let oldKind = kind
        let oldPaused = paused
        kind = object?["kind"] as? String == "countdown" ? "countdown" : "resume"
        if let ms = object?["closeAt"] as? Double, ms.isFinite {
            closeAt = Date(timeIntervalSince1970: ms / 1000)
        }
        paused = object?["paused"] as? Bool ?? false
        if let ms = object?["remainingMs"] as? Double, ms.isFinite {
            remaining = min(max(ms / 1000, 0), 30)
        }

        let seconds = kind == "countdown" ? secondsRemaining : nil
        guard kind != oldKind || paused != oldPaused || seconds != lastPaintedSecond else { return }
        lastPaintedSecond = seconds
        updatePalette()
        if kind != oldKind {
            keepButton.isHidden = kind != "countdown"
            setAccessibilityLabel(kind == "countdown" ? nativeCopy("关闭提醒，悬停暂停，点击保留取消关闭", "Tab close countdown. Hover to pause or select Keep.") : nativeCopy("可以继续了", "Ready"))
        }
        needsDisplay = true
    }
    func verifyNativeControl() throws {
        vertical=true;update(["kind":"countdown","paused":true,"remainingMs":18000.0]);needsLayout=true;layoutSubtreeIfNeeded()
        var pressed=false;onPardon={pressed=true}
        let center=NSPoint(x:keepButton.frame.midX,y:keepButton.frame.midY)
        guard bodyRect.contains(keepButton.frame),keepButton.frame.width>=32,keepButton.frame.height>=20,hitTest(center)===keepButton,keepButton.acceptsFirstMouse(for:nil) else{throw NSError(domain:"TabPilotNativeControls",code:1,userInfo:[NSLocalizedDescriptionKey:"The native keep button is not fully reachable."])}
        keepButton.performClick(nil)
        guard pressed else{throw NSError(domain:"TabPilotNativeControls",code:2,userInfo:[NSLocalizedDescriptionKey:"The native keep button did not invoke cancellation."])}
    }
    private var bodyRect:NSRect {vertical ? NSRect(x:6,y:1,width:bounds.width-7,height:bounds.height-2):NSRect(x:1,y:6,width:bounds.width-2,height:bounds.height-7)}
    override func layout(){
        super.layout();let body=bodyRect
        keepButton.frame=NSRect(x:body.maxX-38,y:body.minY+1,width:34,height:body.height-2)
    }
    override func draw(_ dirtyRect:NSRect){
        let body=bodyRect
        let colors=palette,surface=colors.surface,ink=colors.ink,border=colors.border
        // One continuous outline: rounded corners and a softly curved anchor, with no overpainted seam.
        let shape=NSBezierPath(),radius:CGFloat=7,k:CGFloat=7*0.55228475
        shape.move(to:NSPoint(x:body.minX+radius,y:body.minY))
        if !vertical {
            let x=min(max(anchorOffset ?? bounds.midX,body.minX+radius+5),body.maxX-radius-5)
            shape.line(to:NSPoint(x:x-4,y:body.minY))
            shape.curve(to:NSPoint(x:x,y:body.minY-5),controlPoint1:NSPoint(x:x-2,y:body.minY),controlPoint2:NSPoint(x:x-2,y:body.minY-5))
            shape.curve(to:NSPoint(x:x+4,y:body.minY),controlPoint1:NSPoint(x:x+2,y:body.minY-5),controlPoint2:NSPoint(x:x+2,y:body.minY))
        }
        shape.line(to:NSPoint(x:body.maxX-radius,y:body.minY))
        shape.curve(to:NSPoint(x:body.maxX,y:body.minY+radius),controlPoint1:NSPoint(x:body.maxX-radius+k,y:body.minY),controlPoint2:NSPoint(x:body.maxX,y:body.minY+radius-k))
        shape.line(to:NSPoint(x:body.maxX,y:body.maxY-radius))
        shape.curve(to:NSPoint(x:body.maxX-radius,y:body.maxY),controlPoint1:NSPoint(x:body.maxX,y:body.maxY-radius+k),controlPoint2:NSPoint(x:body.maxX-radius+k,y:body.maxY))
        shape.line(to:NSPoint(x:body.minX+radius,y:body.maxY))
        shape.curve(to:NSPoint(x:body.minX,y:body.maxY-radius),controlPoint1:NSPoint(x:body.minX+radius-k,y:body.maxY),controlPoint2:NSPoint(x:body.minX,y:body.maxY-radius+k))
        if vertical {
            let y=min(max(anchorOffset ?? bounds.midY,body.minY+radius+4),body.maxY-radius-4)
            shape.line(to:NSPoint(x:body.minX,y:y+4))
            shape.curve(to:NSPoint(x:body.minX-5,y:y),controlPoint1:NSPoint(x:body.minX,y:y+2),controlPoint2:NSPoint(x:body.minX-5,y:y+2))
            shape.curve(to:NSPoint(x:body.minX,y:y-4),controlPoint1:NSPoint(x:body.minX-5,y:y-2),controlPoint2:NSPoint(x:body.minX,y:y-2))
        }
        shape.line(to:NSPoint(x:body.minX,y:body.minY+radius))
        shape.curve(to:NSPoint(x:body.minX+radius,y:body.minY),controlPoint1:NSPoint(x:body.minX,y:body.minY+radius-k),controlPoint2:NSPoint(x:body.minX+radius-k,y:body.minY))
        shape.close();surface.setFill();shape.fill();border.setStroke();shape.lineWidth=0.75;shape.stroke()
        let style=NSMutableParagraphStyle();style.alignment = .left
        let textRect=NSRect(x:body.minX+10,y:body.midY-7.5,width:body.width-50,height:16)
        if kind=="countdown" {
            let divider=NSBezierPath();divider.move(to:NSPoint(x:body.maxX-43,y:body.midY-5));divider.line(to:NSPoint(x:body.maxX-43,y:body.midY+5));divider.lineWidth=0.5;ink.withAlphaComponent(0.16).setStroke();divider.stroke()
            let seconds=secondsRemaining
            let label=paused ? nativeCopy("已暂停 · \(seconds) 秒", "Paused · \(seconds)s"):nativeCopy("\(seconds) 秒后关闭", "Closes in \(seconds)s")
            (label as NSString).draw(in:textRect,withAttributes:[.font:NSFont.monospacedDigitSystemFont(ofSize:11.5,weight:.medium),.foregroundColor:ink,.paragraphStyle:style])
        }else{
            let check=NSBezierPath();check.move(to:NSPoint(x:body.minX+10,y:body.midY));check.line(to:NSPoint(x:body.minX+13.5,y:body.midY+3.5));check.line(to:NSPoint(x:body.minX+20,y:body.midY-4));check.lineWidth=1.5;check.lineCapStyle = .round;check.lineJoinStyle = .round;ink.setStroke();check.stroke()
            (nativeCopy("可以继续了", "Ready") as NSString).draw(in:NSRect(x:body.minX+28,y:body.midY-8,width:body.width-34,height:17),withAttributes:[.font:NSFont.systemFont(ofSize:12,weight:.medium),.foregroundColor:ink,.paragraphStyle:style])
        }
    }
}
final class NativeController:NSObject {
    lazy var shortcuts=ChromeShortcuts(send:{[weak self] value in self?.send(value)})
    private var updates: DiaoUpdates?
    private var vaultWork = 0
    let vault=CredentialVault();let geometry=BrowserGeometry();var panel:NSPanel?;var target:TabTarget?;var timer:Timer?;var lastStatus="";var nativeMessaging=false
    var overlayState:[String:Any]?
    var visibleRemaining:Double=20;var lastDisplayTick:TimeInterval?;var lastVisibility:Bool?;var lastVisibilityAt=Date.distantPast
    var lastOverlayRect:CGRect?;var lastAnchorRect:CGRect?
    var probeOutput:URL?
    var probeEvents:[[String:Any]]=[]
    private var focusObserver: NSObjectProtocol?

    override init() {
        super.init()
        focusObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self, self.target != nil else { return }
            if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.google.Chrome" {
                self.tick()
            } else {
                self.hide("chrome_not_frontmost")
            }
        }
    }

    deinit {
        if let focusObserver { NSWorkspace.shared.notificationCenter.removeObserver(focusObserver) }
    }

    func send(_ value:[String:Any]) {
        guard let data=try? JSONSerialization.data(withJSONObject:value) else{return}
        if let url=probeOutput {probeEvents.append(value.filter{$0.key != "apiKey"}.merging(["at":Date().timeIntervalSince1970]){first,_ in first});probeEvents=Array(probeEvents.suffix(256));if let receipt=try? JSONSerialization.data(withJSONObject:["events":probeEvents],options:.sortedKeys){try? receipt.write(to:url,options:.atomic)}}
        guard nativeMessaging else{return}
        var length=UInt32(data.count).littleEndian
        FileHandle.standardOutput.write(Data(bytes:&length,count:4));FileHandle.standardOutput.write(data)
    }
    func coverageVisible(_ window:CGRect,protectedArea:CGRect?=nil)->Bool {
        guard let chrome=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first,
          let list=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] else{return false}
        let windows=list.compactMap { value -> CoverageWindow? in
            guard let id=value[kCGWindowNumber as String] as? Int,let pid=value[kCGWindowOwnerPID as String] as? Int,let layer=value[kCGWindowLayer as String] as? Int,let bounds=value[kCGWindowBounds as String] as? [String:Any],let rect=CGRect(dictionaryRepresentation:bounds as CFDictionary) else{return nil}
            return CoverageWindow(id:id,pid:pid,layer:layer,alpha:value[kCGWindowAlpha as String] as? Double ?? 1,bounds:rect)
        }
        let systemPIDs=Set(NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.dock").filter{$0.bundleURL?.standardizedFileURL.path=="/System/Library/CoreServices/Dock.app"}.map{Int($0.processIdentifier)})
        return windowIsUncovered(window,chromePID:Int(chrome.processIdentifier),ownPID:Int(getpid()),windows:windows,protectedArea:protectedArea,ignoredSystemPIDs:systemPIDs)
    }
    func visibility(_ visible:Bool){
        guard let t=target,overlayState?["kind"] as? String=="countdown",let id=overlayState?["visibilityId"] as? String else{return}
        let now=Date();guard lastVisibility != visible || now.timeIntervalSince(lastVisibilityAt)>=0.75 else{return}
        lastVisibility=visible;lastVisibilityAt=now;send(["type":"closeVisibility","tabId":t.tabId,"visibilityId":id,"visible":visible])
    }
    func hide(_ status: String) {
        lastDisplayTick = nil
        let displayed = panel?.isVisible == true
        if displayed { panel?.orderOut(nil) }
        visibility(false)
        if displayed {
            (panel?.contentView as? OverlayView)?.resetInteraction()
        }
        if status != lastStatus {
            send(["type": "status", "status": status, "reason": reason(status)])
            lastStatus = status
        }
    }
    func reason(_ s:String)->String {[
        "mapped":"已定位原生标签，浮标已显示。",
        "accessibility_required":"需要辅助功能授权；在系统设置的隐私与安全性中，打开设备控制和数据访问（或辅助功能），开启 Mac 助手后重试。",
        "duplicate_title":"标题重复，已隐藏浮标；在 Diao 侧栏查看。",
        "ambiguous_mapping":"无法唯一确定标签，已隐藏浮标；在 Diao 侧栏查看。",
        "tab_not_visible":"标签不在可见范围，已隐藏浮标；滚动到标签后重试。",
        "tab_not_found":"标签标题或 Chrome 界面发生变化，已隐藏；在 Diao 侧栏重新发起定位。",
        "chrome_not_frontmost":"Chrome 不在前台，提醒已暂停，返回后继续。",
        "window_occluded":"Chrome 窗口被遮挡，提醒已暂停。",
        "window_not_frontmost":"目标窗口不在前台，浮标已隐藏。",
        "window_not_matched":"窗口不能唯一匹配，已隐藏；在 Diao 侧栏重新发起定位。",
        "window_minimized":"窗口已最小化，浮标已隐藏。",
        "screen_not_matched":"无法确定目标显示器，已隐藏；使用 Diao 侧栏查看。",
        "chrome_not_running":"Chrome 未运行；打开 Chrome 后重试。",
        "hidden":"浮标已收起。",
        "expired":"本次浮标已结束；可从 Diao 侧栏再次显示。"
    ][s] ?? "定位暂不可用；在 Diao 侧栏重试。"}
    func show(_ target: TabTarget, duration: Double = 20, overlay: [String: Any]? = nil) {
        let sameTarget = self.target?.tabId == target.tabId && self.target?.title == target.title &&
            self.target?.window.rect == target.window.rect
        if !sameTarget {
            if panel?.isVisible == true { hide("hidden") }
            geometry.reset()
        }
        overlayState = overlay
        self.target = target
        visibleRemaining = min(max(duration, 1), 60)
        lastDisplayTick = nil
        lastVisibility = nil
        timer?.invalidate()
        tick()
        guard self.target != nil else { return }
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        self.timer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    func tick() {
        guard let target else { stopOverlay(status: "expired"); return }
        let found = geometry.locate(target)
        guard let tab = found.tab, let window = found.window else { hide(found.status); return }

        // Chrome 的辅助功能坐标以主显示器左上角为原点。
        let primaryTop = NSScreen.screens.first?.frame.maxY ?? 0
        let screens = NSScreen.screens.map {
            CGRect(x: $0.frame.minX, y: primaryTop - $0.frame.maxY,
                   width: $0.frame.width, height: $0.frame.height)
        }
        guard let screen = screens.first(where: { $0.contains(CGPoint(x: tab.rect.midX, y: tab.rect.midY)) }),
              let rect = overlayRect(tab: tab.rect, window: window, screen: screen, vertical: found.vertical) else {
            hide("screen_not_matched")
            return
        }
        guard coverageVisible(window, protectedArea: tab.rect.union(rect)) else { hide("window_occluded"); return }

        let now = ProcessInfo.processInfo.systemUptime
        if let lastDisplayTick, now - lastDisplayTick <= 1 { visibleRemaining -= now - lastDisplayTick }
        lastDisplayTick = now
        guard visibleRemaining > 0 else { stopOverlay(status: "expired"); return }

        let panel = self.panel ?? makeOverlayPanel()
        guard let view = panel.contentView as? OverlayView else { return }
        view.vertical = found.vertical
        view.anchorOffset = found.vertical ? tab.rect.midY - rect.minY : tab.rect.midX - rect.minX
        view.update(overlayState)
        let countdown = view.kind == "countdown"
        panel.ignoresMouseEvents = !countdown
        let frame = CGRect(x: rect.minX, y: primaryTop - rect.maxY, width: rect.width, height: rect.height)
        let changedFrame = panel.frame != frame
        let wasVisible = panel.isVisible
        if changedFrame { panel.setFrame(frame, display: true) }
        NativeMotion.reveal(panel, animated: !countdown)
        if countdown && (!wasVisible || changedFrame) {
            view.updatePointer(at: panel.mouseLocationOutsideOfEventStream)
        }
        visibility(panel.isVisible)

        if lastStatus != "mapped" || lastOverlayRect != rect || lastAnchorRect != tab.rect || probeOutput != nil {
            lastOverlayRect = rect
            lastAnchorRect = tab.rect
            send(["type": "status", "status": "mapped", "reason": reason("mapped"),
                  "orientation": found.vertical ? "vertical" : "horizontal", "tabId": target.tabId,
                  "windowRect": [window.minX, window.minY, window.width, window.height],
                  "screenRect": [screen.minX, screen.minY, screen.width, screen.height],
                  "anchorRect": [tab.rect.minX, tab.rect.minY, tab.rect.width, tab.rect.height],
                  "overlayRect": [rect.minX, rect.minY, rect.width, rect.height],
                  "mouseTransparent": panel.ignoresMouseEvents, "kind": view.kind])
            lastStatus = "mapped"
        }
    }

    private func makeOverlayPanel() -> NSPanel {
        let window = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
                             backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.level = .floating
        window.ignoresMouseEvents = true
        window.animationBehavior = .none
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        window.title = nativeCopy("Diao 标签提醒", "Diao tab reminder")
        window.hidesOnDeactivate = false
        let view = OverlayView()
        view.onPardon = { [weak self] in
            guard let self, let target = self.target else { return }
            self.send(["type": "pardon", "tabId": target.tabId])
            self.stopOverlay(status: "hidden")
        }
        view.onHover = { [weak self] paused in
            guard let self, let target = self.target else { return }
            self.send(["type": "closeHover", "tabId": target.tabId, "paused": paused])
        }
        window.contentView = view
        panel = window
        return window
    }

    private func stopOverlay(status: String) {
        timer?.invalidate()
        timer = nil
        hide(status)
        target = nil
    }
    func handle(_ data:Data){
        guard data.count<=65536,let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let type=object["type"] as? String else{hide("hidden");return}
        if type.hasPrefix("credential.") {
            guard let id = object["requestId"] as? String, !id.isEmpty, id.count <= 64 else { return }
            vaultWork += 1
            vault.perform(object) { [weak self] response in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.vaultWork -= 1
                    self.send(response)
                }
            }
            return
        }
        if type == "updates.check" {
            updates?.checkNow()
            return
        }
        if type=="mruConfigure"{shortcuts.configure(object);return}
        if type=="mruPreview"{shortcuts.preview(object);return}
        if type=="mruDismiss"{shortcuts.dismiss();return}
        if type=="hide"{stopOverlay(status:"hidden");return}
        if type == "setup.openAccessibility" {
            requestBridgeAccessibility()
            return
        }
        if type == "hello" {
            let trusted = AXIsProcessTrusted()
            let name = CredentialVault.storeBuild ? "Diao Bridge" : "TabPilotBridge"
            var capabilities = ["countdown-v1", "visibility-v1", "setup-v1"]
            if updates != nil { capabilities.append("updates-v1") }
            if !CredentialVault.storeBuild || CredentialVault.stableCodeIdentity() {
                capabilities += ["credentials-v1", "credentials-v2"]
            }
            send(["type":"status","status":trusted ? "ready" : "accessibility_required",
                  "reason":trusted ? nativeCopy("辅助程序已连接。", "Mac companion connected.") : nativeCopy("请在系统隐私设置中授权 \(name)。", "Allow \(name) in macOS Accessibility settings."),
                  "version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "unknown",
                  "release":Bundle.main.object(forInfoDictionaryKey:"DiaoReleaseVersion") as? String ?? "",
                  "capabilities":capabilities])
            return
        }
        if type=="overlayUpdate",let tabId=object["tabId"] as? Int,tabId==target?.tabId,let overlay=object["overlay"] as? [String:Any]{overlayState=overlay;if overlay["kind"] as? String=="countdown"{visibleRemaining=60};tick();return}
        if type=="show",let targetData=object["target"],let encoded=try? JSONSerialization.data(withJSONObject:targetData),let decoded=try? JSONDecoder().decode(TabTarget.self,from:encoded),decoded.title.count<=2048 {show(decoded,duration:object["duration"] as? Double ?? 20,overlay:object["overlay"] as? [String:Any])}
    }
    func readMessages(){
        nativeMessaging=true
        if DiaoUpdates.available {
            updates = DiaoUpdates(nativeHost: true, canRestart: { [weak self] in
                guard let self else { return false }
                return self.target == nil && self.shortcuts.state.token == nil && self.vaultWork == 0
            }, notify: { [weak self] status, release in
                var message: [String:Any] = ["type":"helperUpdate","status":status]
                if let release { message["release"] = release }
                self?.send(message)
            })
        }
        DispatchQueue.global(qos:.utility).async{[weak self] in
            func exact(_ count:Int)->Data? {var data=Data();while data.count<count{guard let part=try? FileHandle.standardInput.read(upToCount:count-data.count),!part.isEmpty else{return nil};data.append(part)};return data}
            while let header=exact(4){let length=header.withUnsafeBytes{UInt32(littleEndian:$0.loadUnaligned(as:UInt32.self))};guard length>0,length<=65536,let body=exact(Int(length)) else{break};DispatchQueue.main.async{self?.handle(body)}}
            DispatchQueue.main.async{NSApp.terminate(nil)}
        }
    }
}
final class SetupController: NSObject, NSWindowDelegate {
    private enum Step: Equatable {
        case install, invalid, conflict, failure, authorize, ready

        var presentation: (title: String, detail: String, action: String, symbol: String) {
            switch self {
            case .install:
                return (nativeCopy("安装 Diao Bridge", "Install Diao Bridge"), nativeCopy("安装到「应用程序」后会打开助手，并接续现有的 Chrome 连接。", "Diao Bridge opens after installation and reconnects to Chrome."),
                        nativeCopy("安装助手", "Install companion"), "arrow.down.circle")
            case .invalid:
                return (nativeCopy("请重新下载 Mac 助手", "Download Diao Bridge again"), nativeCopy("这份助手的安装文件不完整。", "This copy of the installer is incomplete."),
                        nativeCopy("打开下载页", "Open downloads"), "arrow.down.circle")
            case .conflict:
                return (nativeCopy("Chrome 连接需要处理", "Chrome connection needs attention"), nativeCopy("此 Mac 已注册另一份助手。按安装说明处理原有连接后，再回到此窗口。", "This Mac has another companion registered. Follow the setup guide to resolve the connection."),
                        nativeCopy("查看安装说明", "Open setup guide"), "link")
            case .failure:
                return (nativeCopy("暂时无法准备助手", "Unable to connect to Chrome"), nativeCopy("Chrome 的助手连接未能保存。请检查此 Mac 的本地设置后重试。", "Check that Chrome is installed and try again."),
                        nativeCopy("重试", "Try again"), "arrow.clockwise")
            case .authorize:
                let name = CredentialVault.storeBuild ? "Diao Bridge" : "Tab Pilot Bridge"
                return (nativeCopy("允许辅助功能访问", "Allow Accessibility access"), nativeCopy("在辅助功能列表中开启 \(name)。如果列表中没有，从「应用程序」添加。", "Turn on \(name) under Accessibility. If it is missing, add it from Applications."),
                        nativeCopy("打开辅助功能设置", "Open Accessibility Settings"), "hand.raised")
            case .ready:
                return (nativeCopy("Mac 助手已就绪", "Diao Bridge is ready"), nativeCopy("在 Diao 的 macOS 设置中开启标签提醒或最近使用切换。", "Turn on tab reminders or recent tab switching in Diao’s macOS settings."),
                        nativeCopy("返回 Chrome", "Return to Chrome"), "checkmark.circle")
            }
        }
    }

    private var step: Step?
    private var window: NSWindow?
    private var accessibilityProbe: Timer?
    private let heading = NSTextField(labelWithString: "")
    private let detail = NSTextField(wrappingLabelWithString: "")
    private let symbol = NSImageView()
    private let mark = NSImageView()
    private lazy var action = NSButton(title: "", target: self, action: #selector(performStep))

    func show() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 424, height: 226),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = CredentialVault.storeBuild ? "Diao Bridge" : "Tab Pilot Bridge"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NativeColors.brandCanvas
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.delegate = self

        heading.font = .systemFont(ofSize: 21, weight: .semibold)
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = NativeColors.secondaryLabel
        detail.maximumNumberOfLines = 4
        symbol.contentTintColor = NativeColors.brandAccent
        symbol.imageScaling = .scaleProportionallyDown
        symbol.setAccessibilityElement(false)
        action.bezelStyle = .rounded
        action.bezelColor = NativeColors.brandAccent
        action.keyEquivalent = "\r"
        action.controlSize = .large
        window.defaultButtonCell = action.cell as? NSButtonCell

        mark.image = Bundle.main.url(forResource: "Diao", withExtension: "icns").flatMap(NSImage.init(contentsOf:))
        mark.imageScaling = .scaleProportionallyDown
        mark.setAccessibilityElement(false)
        let visual = mark.image == nil ? symbol : mark
        let header = NSStackView(views: [visual, heading])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 11
        let text = NSStackView(views: [header, detail])
        text.orientation = .vertical
        text.alignment = .leading
        text.spacing = 9
        text.translatesAutoresizingMaskIntoConstraints = false
        action.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(text)
        content.addSubview(action)
        window.contentView = content
        NSLayoutConstraint.activate([
            visual.widthAnchor.constraint(equalToConstant: 38),
            visual.heightAnchor.constraint(equalToConstant: 38),
            text.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            text.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            text.topAnchor.constraint(equalTo: content.topAnchor, constant: 34),
            detail.widthAnchor.constraint(equalTo: text.widthAnchor),
            action.trailingAnchor.constraint(equalTo: text.trailingAnchor),
            action.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -21),
            action.topAnchor.constraint(greaterThanOrEqualTo: text.bottomAnchor, constant: 14),
        ])

        self.window = window
        refresh(animated: false)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func windowDidBecomeKey(_ notification: Notification) { refresh() }
    func windowWillClose(_ notification: Notification) {
        accessibilityProbe?.invalidate()
        NSApp.terminate(nil)
    }

    private func currentStep() -> Step {
        if CredentialVault.storeBuild {
            do { try StoreSetup.register() }
            catch StoreSetup.Failure.needsInstallation { return .install }
            catch StoreSetup.Failure.incompleteBundle { return .invalid }
            catch StoreSetup.Failure.connectionConflict { return .conflict }
            catch { return .failure }
        }
        return AXIsProcessTrusted() ? .ready : .authorize
    }

    private func refresh(animated: Bool = true) {
        let next = currentStep()
        guard step != next else { return }
        step = next
        accessibilityProbe?.invalidate()
        accessibilityProbe = nil
        if next == .authorize {
            accessibilityProbe = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
                if AXIsProcessTrusted() { self?.refresh() }
            }
        }
        let presentation = next.presentation
        heading.stringValue = presentation.title
        detail.stringValue = presentation.detail
        action.title = presentation.action
        symbol.image = NSImage(systemSymbolName: presentation.symbol, accessibilityDescription: nil)?
            .withSymbolConfiguration(.init(pointSize: 19, weight: .medium))
        if animated, !NativeMotion.reduced {
            mark.alphaValue = 0.85
            symbol.alphaValue = 0.75
            NSAnimationContext.runAnimationGroup { context in
                context.duration = NativeMotion.presentationDuration
                context.timingFunction = NativeMotion.easing
                mark.animator().alphaValue = 1
                symbol.animator().alphaValue = 1
            }
        } else {
            mark.alphaValue = 1
            symbol.alphaValue = 1
        }
    }

    @objc private func showApplications() {
        NSWorkspace.shared.open(StoreSetup.applications)
    }

    @objc private func performStep() {
        guard let step else { return }
        switch step {
        case .install:
            action.isEnabled = false
            action.title = nativeCopy("正在安装…", "Installing…")
            do {
                let destination = try StoreSetup.install()
                let configuration = NSWorkspace.OpenConfiguration()
                configuration.createsNewApplicationInstance = true
                NSWorkspace.shared.openApplication(at: destination, configuration: configuration) { [weak self] _, error in
                    DispatchQueue.main.async {
                        if error == nil { NSApp.terminate(nil) }
                        else {
                            self?.detail.stringValue = nativeCopy("已安装。请从「应用程序」打开 Diao Bridge。", "Installed. Open Diao Bridge from Applications.")
                            self?.action.title = nativeCopy("打开应用程序", "Open Applications")
                            self?.action.action = #selector(SetupController.showApplications)
                            self?.action.isEnabled = true
                        }
                    }
                }
            } catch {
                detail.stringValue = nativeCopy("未能写入「应用程序」。请打开该文件夹核对权限，再重试。", "Diao Bridge could not install in Applications. Check folder permissions and try again.")
                action.title = nativeCopy("重试安装", "Try installing again")
                action.isEnabled = true
            }
        case .invalid:
            NSWorkspace.shared.open(URL(string: "https://github.com/Geeprox/diao/releases/latest")!)
        case .conflict:
            NSWorkspace.shared.open(URL(string: "https://github.com/Geeprox/diao/blob/main/docs/mac-install.md")!)
        case .failure:
            refresh()
        case .authorize:
            if !requestBridgeAccessibility() {
                detail.stringValue = nativeCopy("在系统设置的「隐私与安全性 → 辅助功能」中开启此助手。", "Allow Diao Bridge under System Settings → Privacy & Security → Accessibility.")
            }
        case .ready:
            if let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") {
                NSWorkspace.shared.open(chrome)
            } else {
                detail.stringValue = nativeCopy("安装 Chrome 和 Diao 后，即可在扩展设置中开启 Mac 功能。", "Install Chrome and Diao, then turn on Mac features in the extension.")
            }
        }
    }
}
@main struct Main {
    static func main() throws {
        let args=CommandLine.arguments
        if args.contains("--self-test") {
            NSApplication.shared.setActivationPolicy(.accessory)
            try mappingSelfTest()
            try coverageSelfTest()
            try shortcutSelfTest()
            try credentialSelfTest()
            try StoreSetup.migrationSelfTest()
            try OverlayView(frame: NSRect(x: 0, y: 0, width: 148, height: 26)).verifyNativeControl()
            try verifySwitcherPresentation()
            print("Mapping, visibility, shortcuts, native controls, layout, and credential checks passed.")
            return
        }
        if let i=args.firstIndex(of:"--keychain-probe"),args.count>i+2 {
            let result=try credentialRoundtripProbe(args[i+1],scope:args[i+2]);FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:result,options:.sortedKeys));return
        }
        if let i=args.firstIndex(of:"--keychain-migration-probe"),args.count>i+2 {
            let result=try credentialMigrationProbe(args[i+1],scope:args[i+2]);FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:result,options:.sortedKeys));return
        }
        let controller=NativeController()
        if let index=args.firstIndex(of:"--locate"),args.count>index+1 {
            let target=try JSONDecoder().decode(TabTarget.self,from:Data(contentsOf:URL(fileURLWithPath:args[index+1])))
            let found=controller.geometry.locate(target,foreground:false)
            var output:[String:Any]=["status":found.status,"trusted":AXIsProcessTrusted(),"orientation":found.vertical ? "vertical" : "horizontal"]
            if let r=found.tab?.rect{output["tabRect"]=[r.minX,r.minY,r.width,r.height]};if let r=found.window{output["windowRect"]=[r.minX,r.minY,r.width,r.height]}
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys]));return
        }
        let app=NSApplication.shared;app.setActivationPolicy(.accessory)
        if args.contains("--diagnostics") {
            let screens=NSScreen.screens.map { screen -> [String:Any] in
                let number=screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? UInt32 ?? 0
                return ["id":number,"name":screen.localizedName,"frame":[screen.frame.minX,screen.frame.minY,screen.frame.width,screen.frame.height],"scale":screen.backingScaleFactor,"builtIn":CGDisplayIsBuiltin(number) != 0]
            }
            var report:[String:Any]=["screens":screens,"accessibilityTrusted":AXIsProcessTrusted()]
            if let chrome=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first {
                let element=AXUIElementCreateApplication(chrome.processIdentifier)
                if let focused=attr(element,kAXFocusedWindowAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),let frame=elementRect(unsafeBitCast(focused,to:AXUIElement.self)){report["focusedChromeWindowRect"]=[frame.minX,frame.minY,frame.width,frame.height];report["focusedChromeWindowUncovered"]=controller.coverageVisible(frame)}
            }
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]));return
        }
        if let index = args.firstIndex(of: "--render-switcher"), args.count > index + 1 {
            try verifySwitcherPresentation(renderingTo: URL(fileURLWithPath: args[index + 1], isDirectory: true))
            return
        }
        if let i=args.firstIndex(of:"--render-overlays"),args.count>i+1 {
            let output=URL(fileURLWithPath:args[i+1],isDirectory:true);try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
            var contrast:[String:Any]=[:]
            for dark in [false,true] {
                let appearance=NSAppearance(named:dark ? .darkAqua:.aqua)!
                for vertical in [true,false] { for kind in ["resume","countdown","urgent","paused"] {
                    let size=vertical ? NSSize(width:148,height:26):NSSize(width:142,height:32)
                    let view=OverlayView(frame:NSRect(origin:.zero,size:size));view.appearance=appearance;view.vertical=vertical
                    let seconds=kind == "urgent" ? 4.0:18.0
                    view.update(["kind":kind == "resume" ? "resume":"countdown","paused":kind == "paused","remainingMs":seconds*1000,"closeAt":Date().addingTimeInterval(seconds).timeIntervalSince1970*1000]);view.layoutSubtreeIfNeeded()
                    let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:Int(size.width*2),pixelsHigh:Int(size.height*2),bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!;rep.size=size
                    appearance.performAsCurrentDrawingAppearance {view.cacheDisplay(in:view.bounds,to:rep)}
                    let name=(dark ? "dark-":"")+(vertical ? "vertical-tabs-":"horizontal-tabs-")+kind+".png"
                    try rep.representation(using:.png,properties:[:])!.write(to:output.appendingPathComponent(name))
                    if vertical {
                        let palette=OverlayPalette.resolve(kind:kind == "resume" ? "resume":"countdown",paused:kind == "paused",seconds:Int(seconds),appearance:appearance)
                        let ratios=["normal":palette.textContrast(),"hover":palette.textContrast(overlayAlpha:0.055),"pressed":palette.textContrast(overlayAlpha:0.12)]
                        guard ratios.values.allSatisfy({$0>=4.5}) else{throw NSError(domain:"TabPilotOverlayContrast",code:1,userInfo:[NSLocalizedDescriptionKey:"Overlay text contrast is below 4.5:1."])}
                        contrast[(dark ? "dark-":"light-")+kind]=ratios
                    }
                }}
            }
            try JSONSerialization.data(withJSONObject:contrast,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent("contrast.json"))
            print("Rendered sixteen actual native overlay views at 2x in light/dark appearance. All normal/hover/pressed text pairs pass 4.5:1. Rendering evidence is not desktop acceptance.");return
        }
        if let index=args.firstIndex(of:"--follow"),args.count>index+1 {
            let target=try JSONDecoder().decode(TabTarget.self,from:Data(contentsOf:URL(fileURLWithPath:args[index+1])))
            if let i=args.firstIndex(of:"--receipt"),args.count>i+1{controller.probeOutput=URL(fileURLWithPath:args[i+1])}
            controller.show(target,duration:45)
            DispatchQueue.main.asyncAfter(deadline:.now()+46){app.terminate(nil)}
        }else if args.contains(where:{$0.hasPrefix("chrome-extension://")}){controller.readMessages()}
        else{let setup=SetupController();setup.show();withExtendedLifetime(setup){app.run()};return}
        withExtendedLifetime(controller){app.run()}
    }
}
