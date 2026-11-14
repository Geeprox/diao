import AppKit
import ApplicationServices

func attr(_ e:AXUIElement,_ key:String)->CFTypeRef? {var value:CFTypeRef?;return AXUIElementCopyAttributeValue(e,key as CFString,&value) == .success ? value : nil}
func textAttr(_ e:AXUIElement,_ key:String)->String {attr(e,key) as? String ?? ""}
func elementRect(_ e:AXUIElement)->CGRect? {
    guard let p=attr(e,kAXPositionAttribute),let s=attr(e,kAXSizeAttribute),CFGetTypeID(p)==AXValueGetTypeID(),CFGetTypeID(s)==AXValueGetTypeID() else{return nil}
    var point=CGPoint.zero;var size=CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p,to:AXValue.self),.cgPoint,&point),AXValueGetValue(unsafeBitCast(s,to:AXValue.self),.cgSize,&size) else{return nil}
    return CGRect(origin:point,size:size)
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
// Clear pastel surfaces stay opaque so Chrome content cannot alter text contrast.
// Dark appearance keeps a soft, luminous fill rather than turning the state colors muddy.
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
            values=dark ? (0xBFE9D6,0x204E40,0x8FC6AD):(0xDAF5E8,0x275E50,0xA5D8C3)
        }else if paused {
            values=dark ? (0xCBE3F8,0x2C506F,0x92BBDC):(0xE0F1FF,0x345E81,0xA7CDEB)
        }else if seconds<=5 {
            values=dark ? (0xF4CCD6,0x773246,0xD99BAA):(0xFFE4E9,0x8D3E50,0xE8B1BB)
        }else{
            values=dark ? (0xF4DFA8,0x614916,0xCDB276):(0xFFF2CF,0x725618,0xE6CE8A)
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
final class OverlayKeepButton:NSButton {
    private var hovered=false
    private var tracking:NSTrackingArea?
    override func acceptsFirstMouse(for event:NSEvent?)->Bool {true}
    override func updateTrackingAreas(){
        if let tracking=tracking {removeTrackingArea(tracking)}
        tracking=NSTrackingArea(rect:.zero,options:[.mouseEnteredAndExited,.activeAlways,.inVisibleRect],owner:self,userInfo:nil)
        addTrackingArea(tracking!);super.updateTrackingAreas()
    }
    override func mouseEntered(with event:NSEvent){hovered=true;needsDisplay=true}
    override func mouseExited(with event:NSEvent){hovered=false;needsDisplay=true}
    override func draw(_ dirtyRect:NSRect){
        if hovered || isHighlighted {
            let shape=NSBezierPath(roundedRect:bounds.insetBy(dx:0.5,dy:1),xRadius:4,yRadius:4)
            (contentTintColor ?? .labelColor).withAlphaComponent(isHighlighted ? 0.12:0.055).setFill();shape.fill()
        }
        super.draw(dirtyRect)
    }
}
final class OverlayView:NSView {
    var vertical=false
    var anchorOffset:CGFloat?
    var kind="resume"
    var closeAt=Date.distantPast
    var paused=false
    var remaining:Double=30
    var onHover:((Bool)->Void)?
    var onPardon:(()->Void)?
    private var area:NSTrackingArea?
    private var inside=false
    private lazy var keepButton:NSButton = {
        let button=OverlayKeepButton(title:"保留",target:self,action:#selector(keep))
        button.font=NSFont.systemFont(ofSize:11.5,weight:.medium)
        button.isBordered=false
        button.toolTip="保留此页，取消本次关闭"
        button.setAccessibilityLabel("保留此页，取消本次关闭")
        return button
    }()
    private var secondsRemaining:Int {Int(ceil(paused ? remaining:max(0,closeAt.timeIntervalSinceNow)))}
    private var palette:OverlayPalette {OverlayPalette.resolve(kind:kind,paused:paused,seconds:secondsRemaining,appearance:effectiveAppearance)}
    private func updatePalette(){
        let ink=palette.ink
        keepButton.contentTintColor=ink
        keepButton.attributedTitle=NSAttributedString(string:"保留",attributes:[.font:NSFont.systemFont(ofSize:11.5,weight:.medium),.foregroundColor:ink])
    }
    override func viewDidChangeEffectiveAppearance(){super.viewDidChangeEffectiveAppearance();updatePalette();needsDisplay=true}
    override var isFlipped:Bool {true}
    override init(frame:NSRect){super.init(frame:frame);addSubview(keepButton)}
    required init?(coder:NSCoder){fatalError("init(coder:) is unavailable")}
    @objc private func keep(){onPardon?()}
    func resetInteraction(){inside=false}
    override func updateTrackingAreas(){
        if let area=area {removeTrackingArea(area)}
        area=NSTrackingArea(rect:.zero,options:[.mouseEnteredAndExited,.activeAlways,.inVisibleRect],owner:self,userInfo:nil)
        addTrackingArea(area!);super.updateTrackingAreas()
    }
    override func mouseEntered(with event:NSEvent){if kind=="countdown" && !inside {inside=true;onHover?(true)}}
    override func mouseExited(with event:NSEvent){if inside {inside=false;onHover?(false)}}
    func update(_ object:[String:Any]?){
        kind=object?["kind"] as? String == "countdown" ? "countdown":"resume"
        if let milliseconds=object?["closeAt"] as? Double,milliseconds.isFinite {closeAt=Date(timeIntervalSince1970:milliseconds/1000)}
        paused=object?["paused"] as? Bool ?? false
        if let milliseconds=object?["remainingMs"] as? Double,milliseconds.isFinite {remaining=min(max(milliseconds/1000,0),30)}
        updatePalette();keepButton.isHidden=kind != "countdown";setAccessibilityRole(.group);setAccessibilityLabel(kind == "countdown" ? "关闭提醒，悬停暂停，点击保留取消关闭":"可以继续了");needsDisplay=true
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
            let label=paused ? "已暂停 · \(seconds) 秒":"\(seconds) 秒后关闭"
            (label as NSString).draw(in:textRect,withAttributes:[.font:NSFont.monospacedDigitSystemFont(ofSize:11.5,weight:.medium),.foregroundColor:ink,.paragraphStyle:style])
        }else{
            let check=NSBezierPath();check.move(to:NSPoint(x:body.minX+10,y:body.midY));check.line(to:NSPoint(x:body.minX+13.5,y:body.midY+3.5));check.line(to:NSPoint(x:body.minX+20,y:body.midY-4));check.lineWidth=1.5;check.lineCapStyle = .round;check.lineJoinStyle = .round;ink.setStroke();check.stroke()
            ("可以继续了" as NSString).draw(in:NSRect(x:body.minX+28,y:body.midY-8,width:body.width-34,height:17),withAttributes:[.font:NSFont.systemFont(ofSize:12,weight:.medium),.foregroundColor:ink,.paragraphStyle:style])
        }
    }
}
final class NativeController:NSObject {
    lazy var shortcuts=ChromeShortcuts(send:{[weak self] value in self?.send(value)})
    let vault=CredentialVault();let geometry=BrowserGeometry();var panel:NSPanel?;var target:TabTarget?;var deadline=Date.distantPast;var timer:Timer?;var lastStatus="";var nativeMessaging=false
    var overlayState:[String:Any]?
    var visibleRemaining:Double=20;var lastDisplayTick:Date?;var lastVisibility:Bool?;var lastVisibilityAt=Date.distantPast
    var lastOverlayRect:CGRect?;var lastAnchorRect:CGRect?
    var probeOutput:URL?
    var probeEvents:[[String:Any]]=[]
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
    func hide(_ status:String){lastDisplayTick=nil;visibility(false);panel?.orderOut(nil);if status != lastStatus{send(["type":"status","status":status,"reason":reason(status)]);lastStatus=status}}
    func reason(_ s:String)->String {[
        "mapped":"已定位原生标签，浮标已显示。",
        "accessibility_required":"需要辅助功能授权；在系统设置的隐私与安全性中，打开设备控制和数据访问（或辅助功能），添加 TabPilotBridge 后重试。",
        "duplicate_title":"标题重复，已隐藏浮标；在 Side Panel 中查看。",
        "ambiguous_mapping":"无法唯一确定标签，已隐藏浮标；在 Side Panel 中查看。",
        "tab_not_visible":"标签不在可见范围，已隐藏浮标；滚动到标签后重试。",
        "tab_not_found":"标签标题或 Chrome 界面发生变化，已隐藏；在 Side Panel 中重新发起定位。",
        "chrome_not_frontmost":"Chrome 不在前台，提醒已暂停，返回后继续。",
        "window_occluded":"Chrome 窗口被遮挡，提醒已暂停。",
        "window_not_frontmost":"目标窗口不在前台，浮标已隐藏。",
        "window_not_matched":"窗口不能唯一匹配，已隐藏；在 Side Panel 中重新发起定位。",
        "window_minimized":"窗口已最小化，浮标已隐藏。",
        "screen_not_matched":"无法确定目标显示器，已隐藏；使用 Side Panel 查看。",
        "chrome_not_running":"Chrome 未运行；打开 Chrome 后重试。",
        "hidden":"浮标已收起。",
        "expired":"本次浮标已结束；可从 Side Panel 再次显示。"
    ][s] ?? "定位暂不可用；在 Side Panel 中重试。"}
    func show(_ t:TabTarget,duration:Double=20,overlay:[String:Any]?=nil){let sameTarget=target?.tabId==t.tabId && target?.title==t.title && target?.window.rect==t.window.rect;overlayState=overlay;(panel?.contentView as? OverlayView)?.resetInteraction();target=t;if !sameTarget {geometry.reset()};deadline=Date().addingTimeInterval(min(max(duration,1),60));visibleRemaining=min(max(duration,1),60);lastDisplayTick=nil;lastVisibility=nil;timer?.invalidate();tick();timer=Timer.scheduledTimer(withTimeInterval:0.25,repeats:true){[weak self]_ in self?.tick()}}
    func tick(){
        guard let t=target else{timer?.invalidate();timer=nil;target=nil;hide("expired");return}
        let found=geometry.locate(t)
        guard let tab=found.tab,let window=found.window else{hide(found.status);return}
        let now=Date();if let last=lastDisplayTick,now.timeIntervalSince(last)<=1 {visibleRemaining-=max(0,now.timeIntervalSince(last))};lastDisplayTick=now
        guard visibleRemaining>0 else{target=nil;timer?.invalidate();timer=nil;hide("expired");return}
        // AX global coordinates use the top-left of the primary display. AppKit uses bottom-left.
        let primaryTop=NSScreen.screens.first?.frame.maxY ?? 0
        let screens=NSScreen.screens.map {CGRect(x:$0.frame.minX,y:primaryTop-$0.frame.maxY,width:$0.frame.width,height:$0.frame.height)}
        guard let screen=screens.first(where:{$0.contains(CGPoint(x:tab.rect.midX,y:tab.rect.midY))}),let rect=overlayRect(tab:tab.rect,window:window,screen:screen,vertical:found.vertical) else{hide("screen_not_matched");return}
        guard coverageVisible(window,protectedArea:tab.rect.union(rect)) else{hide("window_occluded");return}
        if panel==nil {let p=NSPanel(contentRect:.zero,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false);p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=true;p.level = .floating;p.ignoresMouseEvents=true;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.transient];p.title="Tab Pilot 标签提醒";p.hidesOnDeactivate=false;p.contentView=OverlayView();panel=p}
        if let v=panel?.contentView as? OverlayView {
            v.vertical=found.vertical;v.anchorOffset=found.vertical ? tab.rect.midY-rect.minY:tab.rect.midX-rect.minX;v.update(overlayState)
            v.onPardon={[weak self] in guard let self=self,let target=self.target else{return};self.send(["type":"pardon","tabId":target.tabId]);self.target=nil;self.timer?.invalidate();self.timer=nil;self.hide("hidden")}
            v.onHover={[weak self] paused in guard let self=self,let target=self.target else{return};self.send(["type":"closeHover","tabId":target.tabId,"paused":paused])}
            panel?.ignoresMouseEvents=v.kind != "countdown"
        }
        panel?.setFrame(CGRect(x:rect.minX,y:primaryTop-rect.maxY,width:rect.width,height:rect.height),display:true)
        panel?.orderFrontRegardless();visibility(panel?.isVisible==true)
        if lastStatus != "mapped" || lastOverlayRect != rect || lastAnchorRect != tab.rect || probeOutput != nil {lastOverlayRect=rect;lastAnchorRect=tab.rect;send(["type":"status","status":"mapped","reason":reason("mapped"),"orientation":found.vertical ? "vertical" : "horizontal","tabId":t.tabId,"windowRect":[window.minX,window.minY,window.width,window.height],"screenRect":[screen.minX,screen.minY,screen.width,screen.height],"anchorRect":[tab.rect.minX,tab.rect.minY,tab.rect.width,tab.rect.height],"overlayRect":[rect.minX,rect.minY,rect.width,rect.height],"mouseTransparent":panel?.ignoresMouseEvents ?? true,"kind":overlayState?["kind"] as? String ?? "resume"]);lastStatus="mapped"}
    }
    func handle(_ data:Data){
        guard data.count<=65536,let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let type=object["type"] as? String else{hide("hidden");return}
        if type.hasPrefix("credential."){vault.perform(object){[weak self] response in self?.send(response)};return}
        if type=="mruConfigure"{shortcuts.configure(object);return}
        if type=="mruPreview"{shortcuts.preview(object);return}
        if type=="mruDismiss"{shortcuts.dismiss();return}
        if type=="hide"{target=nil;timer?.invalidate();timer=nil;hide("hidden");return}
        if type == "hello" {
            let trusted = AXIsProcessTrusted()
            let name = CredentialVault.storeBuild ? "Tab Cadence Bridge" : "TabPilotBridge"
            var capabilities = ["countdown-v1", "visibility-v1"]
            if !CredentialVault.storeBuild || CredentialVault.stableCodeIdentity() {
                capabilities += ["credentials-v1", "credentials-v2"]
            }
            send(["type":"status","status":trusted ? "ready" : "accessibility_required",
                  "reason":trusted ? "辅助程序已连接。" : "请在系统隐私设置中授权 \(name)。",
                  "version":Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "unknown",
                  "capabilities":capabilities])
            return
        }
        if type=="overlayUpdate",let tabId=object["tabId"] as? Int,tabId==target?.tabId,let overlay=object["overlay"] as? [String:Any]{overlayState=overlay;if overlay["kind"] as? String=="countdown"{visibleRemaining=60};tick();return}
        if type=="show",let targetData=object["target"],let encoded=try? JSONSerialization.data(withJSONObject:targetData),let decoded=try? JSONDecoder().decode(TabTarget.self,from:encoded),decoded.title.count<=2048 {show(decoded,duration:object["duration"] as? Double ?? 20,overlay:object["overlay"] as? [String:Any])}
    }
    func readMessages(){
        nativeMessaging=true
        DispatchQueue.global(qos:.utility).async{[weak self] in
            func exact(_ count:Int)->Data? {var data=Data();while data.count<count{guard let part=try? FileHandle.standardInput.read(upToCount:count-data.count),!part.isEmpty else{return nil};data.append(part)};return data}
            while let header=exact(4){let length=header.withUnsafeBytes{UInt32(littleEndian:$0.loadUnaligned(as:UInt32.self))};guard length>0,length<=65536,let body=exact(Int(length)) else{break};DispatchQueue.main.async{self?.handle(body)}}
            DispatchQueue.main.async{NSApp.terminate(nil)}
        }
    }
}
final class SetupController:NSObject {
    var window:NSWindow?
    let storeBuild = CredentialVault.storeBuild
    let registrationState = NSTextField(wrappingLabelWithString: "")
    let status=NSTextField(wrappingLabelWithString:"")
    func show(){
        NSApp.setActivationPolicy(.regular)
        let w=NSWindow(contentRect:NSRect(x:0,y:0,width:420,height:storeBuild ? 330 : 250),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        w.title=storeBuild ? "Tab Cadence Bridge" : "Tab Pilot Bridge";w.isReleasedWhenClosed=false
        let title=NSTextField(labelWithString:storeBuild ? "连接 Tab Cadence" : "让提醒，贴近正在做的事。")
        title.font=NSFont.systemFont(ofSize:19,weight:.semibold)
        let detail=NSTextField(wrappingLabelWithString:"辅助程序读取 Chrome 原生标签位置。仅在启用快捷切换时处理 Chrome 的 Control+Tab。通过扩展的 macOS 设置开启提醒。")
        detail.font=NSFont.systemFont(ofSize:13);detail.textColor = .secondaryLabelColor
        let open=NSButton(title:"打开辅助功能设置",target:self,action:#selector(openSettings))
        let refresh=NSButton(title:"刷新授权状态",target:self,action:#selector(refreshStatus))
        var controls: [NSView] = [title, detail]
        if storeBuild {
            controls.append(NSButton(title:"连接 Chrome",target:self,action:#selector(registerChrome)))
            registrationState.font = NSFont.systemFont(ofSize:12)
            registrationState.maximumNumberOfLines = 0
            controls.append(registrationState)
        }
        controls += [status, open, refresh]
        let stack=NSStackView(views:controls);stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=14;stack.translatesAutoresizingMaskIntoConstraints=false
        w.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:w.contentView!.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:w.contentView!.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:w.contentView!.topAnchor,constant:24)])
        window=w;refreshStatus();w.center();w.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
    }
    @objc func registerChrome() {
        do {
            try StoreSetup.register()
            registrationState.stringValue = "Chrome 连接已注册。"
        } catch {
            registrationState.stringValue = error.localizedDescription
        }
    }
    @objc func refreshStatus(){
        let name = storeBuild ? "Tab Cadence Bridge" : "TabPilotBridge"
        status.stringValue = AXIsProcessTrusted() ? "辅助功能已授权。可以返回扩展验证浮标。" : "请在辅助功能列表中添加并启用 \(name)。"
        status.font = NSFont.systemFont(ofSize:12)
    }
    @objc func openSettings(){NSWorkspace.shared.open(URL(string:"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)}
}
@main struct Main {
    static func main() throws {
        let args=CommandLine.arguments
        if args.contains("--self-test"){let app=NSApplication.shared;app.setActivationPolicy(.accessory);try mappingSelfTest();try coverageSelfTest();try shortcutSelfTest();try credentialSelfTest();try OverlayView(frame:NSRect(x:0,y:0,width:148,height:26)).verifyNativeControl();print("Mapping, Chrome shortcut state and native control hit/action and credential validation checks passed");return}
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
