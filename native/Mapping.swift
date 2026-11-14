import Foundation

struct TabTarget: Codable {
    struct Bounds: Codable { let left: Double; let top: Double; let width: Double; let height: Double
        var rect: CGRect { CGRect(x:left,y:top,width:width,height:height) }
    }
    let tabId: Int
    let title: String
    let labels: [String]?
    let otherTitles: [String]?
    let window: Bounds
    let titleCount: Int
}
struct NativeTab {
    let label: String
    let rect: CGRect
    let clip: CGRect
}
enum MappingFailure: String, Error { case duplicate="duplicate_title",missing="tab_not_found",hidden="tab_not_visible",ambiguous="ambiguous_mapping",window="window_not_matched" }
func matchTab(_ target: TabTarget, tabs: [NativeTab]) -> Result<NativeTab,MappingFailure> {
    guard target.titleCount==1 else { return .failure(.duplicate) }
    let labels=Set((target.labels ?? [])+[target.title])
    let matches=tabs.filter{labels.contains($0.label)}
    guard !matches.isEmpty else {return .failure(.missing)}
    guard matches.count==1 else {return .failure(.ambiguous)}
    let match=matches[0]
    guard !(target.otherTitles ?? []).contains(match.label) else {return .failure(.ambiguous)}
    guard match.rect.width>=24,match.rect.height>=16,match.clip.insetBy(dx:-0.5,dy:-0.5).contains(match.rect) else {return .failure(.hidden)}
    return .success(match)
}
func isVerticalTab(_ tab:NativeTab,window:CGRect,tabs:[NativeTab])->Bool {
    guard tab.rect.width>60 else{return false}
    // AX retains offscreen peers while scrolling. They still establish the strip orientation.
    if tabs.contains(where:{$0.rect.height>=16 && abs($0.rect.minX-tab.rect.minX)<8 && abs($0.rect.minY-tab.rect.minY)>10}) {return true}
    let clip=tab.clip
    if clip.width<window.width*0.5 && clip.height>max(tab.rect.height*2,clip.width) {return true}
    return tab.rect.minX<window.minX+100 && tab.rect.minY>window.minY+80
}
func sameWindow(_ a:CGRect,_ b:CGRect)->Bool {abs(a.minX-b.minX)<12 && abs(a.minY-b.minY)<12 && abs(a.width-b.width)<12 && abs(a.height-b.height)<12}
func overlayRect(tab:CGRect,window:CGRect,screen:CGRect,vertical:Bool)->CGRect? {
    // Never cover the native tab. Completion passes pointer events through; countdown controls are interactive.
    let size=vertical ? CGSize(width:148,height:26) : CGSize(width:142,height:32)
    var r=CGRect(origin:vertical ? CGPoint(x:tab.maxX+3,y:tab.midY-13) : CGPoint(x:tab.midX-71,y:tab.maxY+3),size:size)
    r.origin.x=min(max(r.minX,screen.minX+8),screen.maxX-r.width-8)
    r.origin.y=min(max(r.minY,screen.minY+8),screen.maxY-r.height-8)
    guard !r.intersects(tab),screen.contains(r),window.intersects(tab) else{return nil}
    return r
}
func mappingSelfTest() throws {
    let bounds=TabTarget.Bounds(left:0,top:30,width:1200,height:800)
    let target=TabTarget(tabId:1,title:"Probe",labels:nil,otherTitles:nil,window:bounds,titleCount:1)
    let visible=NativeTab(label:"Probe",rect:CGRect(x:50,y:70,width:160,height:30),clip:bounds.rect)
    guard case .success=matchTab(target,tabs:[visible]) else {throw MappingFailure.missing}
    guard case .failure(.ambiguous)=matchTab(target,tabs:[visible,visible]) else {throw MappingFailure.ambiguous}
    let hidden=NativeTab(label:"Probe",rect:CGRect(x:50,y:900,width:160,height:30),clip:bounds.rect)
    guard case .failure(.hidden)=matchTab(target,tabs:[hidden]) else {throw MappingFailure.hidden}
    let alternate=TabTarget(tabId:1,title:"Probe",labels:["Probe - group"],otherTitles:["Probe - group"],window:bounds,titleCount:1)
    let alias=NativeTab(label:"Probe - group",rect:visible.rect,clip:visible.clip)
    guard case .failure(.ambiguous)=matchTab(alternate,tabs:[alias]) else {throw MappingFailure.ambiguous}
    let lower=NativeTab(label:"Probe",rect:CGRect(x:22,y:760,width:206,height:30),clip:bounds.rect)
    let offscreenPeer=NativeTab(label:"Peer",rect:CGRect(x:22,y:-100,width:206,height:30),clip:bounds.rect)
    let horizontal=NativeTab(label:"Probe",rect:CGRect(x:90,y:42,width:180,height:30),clip:bounds.rect)
    guard isVerticalTab(lower,window:bounds.rect,tabs:[lower]),isVerticalTab(lower,window:bounds.rect,tabs:[lower,offscreenPeer]),!isVerticalTab(horizontal,window:bounds.rect,tabs:[horizontal]) else{throw MappingFailure.ambiguous}
    let adjacentA=CGRect(x:20,y:120,width:206,height:30),adjacentB=CGRect(x:20,y:152,width:206,height:30)
    let display=CGRect(x:0,y:0,width:1440,height:900)
    guard let a=overlayRect(tab:adjacentA,window:display,screen:display,vertical:true),let b=overlayRect(tab:adjacentB,window:display,screen:display,vertical:true),a.maxY<b.minY,a.height<adjacentA.height else{throw MappingFailure.hidden}
    for screen in [CGRect(x:0,y:0,width:1440,height:900),CGRect(x:-1600,y:0,width:1600,height:1000)] {
        for vertical in [true,false] {let t=CGRect(x:screen.minX+60,y:80,width:160,height:30);guard let r=overlayRect(tab:t,window:screen,screen:screen,vertical:vertical),screen.contains(r),!r.intersects(t) else {throw MappingFailure.hidden}}
    }
}

struct CoverageWindow {let id:Int;let pid:Int;let layer:Int;let alpha:Double;let bounds:CGRect}
func windowIsUncovered(_ target:CGRect,chromePID:Int,ownPID:Int,windows:[CoverageWindow],protectedArea:CGRect?=nil,ignoredSystemPIDs:Set<Int>=[])->Bool {
    let matches=windows.filter{$0.pid==chromePID && $0.layer==0 && sameWindow($0.bounds,target)}
    guard matches.count==1,let match=matches.first,let index=windows.firstIndex(where:{$0.id==match.id}) else{return false}
    let area=protectedArea ?? target
    return !windows.prefix(index).contains{$0.pid != ownPID && !ignoredSystemPIDs.contains($0.pid) && $0.layer>=0 && $0.layer<1000 && $0.alpha>0.01 && $0.bounds.width>3 && $0.bounds.height>3 && $0.bounds.intersects(area)}
}
func coverageSelfTest() throws {
    let frame=CGRect(x:20,y:30,width:1000,height:800)
    let chrome=CoverageWindow(id:1,pid:10,layer:0,alpha:1,bounds:frame)
    let covering=CoverageWindow(id:2,pid:20,layer:0,alpha:1,bounds:CGRect(x:30,y:50,width:100,height:100))
    let own=CoverageWindow(id:3,pid:30,layer:3,alpha:1,bounds:covering.bounds)
    guard windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[chrome]),!windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[covering,chrome]),windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[own,chrome]),!windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[]) else{throw MappingFailure.hidden}
    let systemDesktop=CoverageWindow(id:5,pid:99,layer:20,alpha:1,bounds:CGRect(x:0,y:0,width:2000,height:1200))
    let protected=CGRect(x:800,y:500,width:148,height:30)
    guard windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[systemDesktop,chrome],protectedArea:protected,ignoredSystemPIDs:[99]),windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[covering,chrome],protectedArea:protected),!windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[systemDesktop,chrome],protectedArea:protected) else{throw MappingFailure.hidden}
    let offscreen=CoverageWindow(id:4,pid:20,layer:0,alpha:1,bounds:CGRect(x:-500,y:0,width:100,height:100))
    guard windowIsUncovered(frame,chromePID:10,ownPID:30,windows:[offscreen,chrome]) else{throw MappingFailure.hidden}
}
