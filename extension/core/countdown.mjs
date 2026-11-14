// Credit only consecutive, fresh confirmations of visibility. Wall time while hidden is never consumed.
export function advanceCountdown(record,{visible,hovered=record.hoverPaused===true,now=Date.now()}={}){
 const remaining=Number.isFinite(record.remainingMs)?record.remainingMs:Math.max(0,(record.closeAt||now)-(record.visibleAt||now));
 const elapsed=now-(record.visibleAt||now),counting=visible===true&&!hovered;
 const credit=counting&&record.counting===true&&elapsed>=0&&elapsed<=2500?elapsed:0;
 const remainingMs=Math.max(0,remaining-credit);
 return {...record,state:counting?'closing':'paused',remainingMs,hoverPaused:hovered,visibilityPaused:visible!==true,counting,visibleAt:now,closeAt:counting?now+remainingMs:null};
}
export function nativeVisibilityFresh(record,now=Date.now()){
 return record.nativeVisible===true&&record.nativeVisibilityId===record.visibilityId&&now-record.nativeVisibleAt>=0&&now-record.nativeVisibleAt<=1500;
}
