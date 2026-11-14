import AppKit
import ApplicationServices
import Carbon

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
    struct Item:Decodable {let id:Int;let title:String;let site:String}
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
        guard AXIsProcessTrusted() else{stop();report("accessibility_required","快捷切换需要辅助功能授权；在系统设置中启用当前 TabPilotBridge，再重新保存此开关。");return}
        guard let process=NSRunningApplication.runningApplications(withBundleIdentifier:"com.google.Chrome").first else{stop();report("chrome_not_running","打开 Chrome 后重新保存快捷切换设置。");return}
        if tap==nil || chromePID != process.processIdentifier {
            stop();chromePID=process.processIdentifier
            let mask=[CGEventType.keyDown,.keyUp,.flagsChanged,.leftMouseDown,.rightMouseDown].reduce(CGEventMask(0)){$0 | (CGEventMask(1)<<$1.rawValue)}
            let callback:CGEventTapCallBack={_,type,event,info in
                guard let info=info else{return Unmanaged.passUnretained(event)}
                return Unmanaged<ChromeShortcuts>.fromOpaque(info).takeUnretainedValue().handle(type,event)
            }
            guard let port=CGEvent.tapCreateForPid(pid:chromePID,place:.headInsertEventTap,options:.defaultTap,eventsOfInterest:mask,callback:callback,userInfo:Unmanaged.passUnretained(self).toOpaque()) else{report("permission_required","macOS 尚未允许接管快捷键；检查 TabPilotBridge 的辅助功能授权，再重新保存此开关。");return}
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
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {end(cancel:false);stop();report("paused","快捷键接管已暂停；在 Tab Pilot 设置中重新保存以恢复。");return Unmanaged.passUnretained(event)}
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
    func preview(_ object:[String:Any]) {
        guard let data=try? JSONSerialization.data(withJSONObject:object),let value=try? JSONDecoder().decode(SwitcherPreview.self,from:data),value.gesture==state.token,let context=context,!value.items.isEmpty,value.items.count<=9,NSWorkspace.shared.frontmostApplication?.processIdentifier==chromePID else{return}
        let content=NSVisualEffectView();content.material = .popover;content.blendingMode = .behindWindow;content.state = .active;content.wantsLayer=true;content.layer?.cornerRadius=18;content.layer?.masksToBounds=true
        let stack=NSStackView();stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=6;stack.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(stack)
        let heading=NSTextField(labelWithString:"最近使用");heading.font = .systemFont(ofSize:14,weight:.semibold);stack.addArrangedSubview(heading)
        let summary=NSTextField(labelWithString:"\(value.index) / \(value.total) · 当前窗口");summary.font = .monospacedDigitSystemFont(ofSize:11,weight:.regular);summary.textColor = .secondaryLabelColor;stack.addArrangedSubview(summary)
        for item in value.items {
            let selected=item.id==value.selectedId
            let row=NSView();row.wantsLayer=true;row.layer?.cornerRadius=9;if selected{row.layer?.backgroundColor=NSColor(calibratedRed:0.14,green:0.36,blue:0.27,alpha:0.15).cgColor}
            let title=NSTextField(labelWithString:item.title);title.font = .systemFont(ofSize:13,weight:selected ? .semibold:.regular);title.lineBreakMode = .byTruncatingTail;title.toolTip=item.title;title.setAccessibilityLabel(item.title+(selected ? "，已选择":""))
            let site=NSTextField(labelWithString:item.site);site.font = .systemFont(ofSize:11);site.textColor = .secondaryLabelColor;site.lineBreakMode = .byTruncatingTail
            let labels=NSStackView(views:[title,site]);labels.orientation = .vertical;labels.alignment = .leading;labels.spacing=2;labels.translatesAutoresizingMaskIntoConstraints=false;row.addSubview(labels);stack.addArrangedSubview(row)
            NSLayoutConstraint.activate([row.widthAnchor.constraint(equalTo:stack.widthAnchor),row.heightAnchor.constraint(equalToConstant:48),labels.leadingAnchor.constraint(equalTo:row.leadingAnchor,constant:10),labels.trailingAnchor.constraint(equalTo:row.trailingAnchor,constant:-10),labels.centerYAnchor.constraint(equalTo:row.centerYAnchor),title.widthAnchor.constraint(equalTo:labels.widthAnchor),site.widthAnchor.constraint(equalTo:labels.widthAnchor)])
        }
        let footer=NSTextField(wrappingLabelWithString:"松开 Control 确认 · ⇧ 反向 · esc 取消");footer.font = .systemFont(ofSize:11);footer.textColor = .secondaryLabelColor;stack.addArrangedSubview(footer)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:content.leadingAnchor,constant:18),stack.trailingAnchor.constraint(equalTo:content.trailingAnchor,constant:-18),stack.topAnchor.constraint(equalTo:content.topAnchor,constant:18),stack.bottomAnchor.constraint(equalTo:content.bottomAnchor,constant:-18)])
        if panel==nil {let p=NSPanel(contentRect:.zero,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false);p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=true;p.level = .floating;p.ignoresMouseEvents=true;p.collectionBehavior=[.fullScreenAuxiliary,.transient];panel=p}
        let primaryTop=NSScreen.screens.first?.frame.maxY ?? 0;let r=context.window.rect;let height=CGFloat(110+value.items.count*54);let width=min(CGFloat(420),r.width-48)
        let center=CGPoint(x:r.midX,y:primaryTop-r.midY);let screen=NSScreen.screens.first{$0.visibleFrame.contains(center)}?.visibleFrame ?? NSScreen.main?.visibleFrame ?? CGRect(x:0,y:0,width:1440,height:900)
        let h=min(height,screen.height-40);let rect=CGRect(x:min(max(center.x-width/2,screen.minX+20),screen.maxX-width-20),y:min(max(center.y-h/2,screen.minY+20),screen.maxY-h-20),width:width,height:h)
        // Use a scroll view so small screens never clip the instruction or selected row.
        let scroll=NSScrollView(frame:CGRect(origin:.zero,size:rect.size));scroll.drawsBackground=false;scroll.hasVerticalScroller=true;scroll.documentView=content;content.frame=CGRect(x:0,y:0,width:width,height:height)
        panel?.contentView=scroll;panel?.setFrame(rect,display:true);panel?.orderFrontRegardless()
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
