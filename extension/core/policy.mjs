export const STATES = ['keep', 'waiting', 'resume', 'close'];
export const DEFAULTS = Object.freeze({provider:'decisions', endpoint:'https://api.openai.com/v1', model:'gpt-6-luna', autoAnalyze:false, rememberKey:false, credentialStorage:'', nativeEnabled:false, switcherEnabled:false});
export function safeURL(raw) {
  try { const u=new URL(raw); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
export function privateURL(raw) {
 try{
  const host=new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host.includes(':'))return host==='::'||host==='::1'||/^f[cd]|^fe[89ab]|^::ffff:/.test(host);
  if(/(^|\.)(localhost|local|lan|internal|home|test)$/.test(host)||host.endsWith('.home.arpa')||!host.includes('.'))return true;
  const ip=host.split('.').map(Number);
  if(ip.length===4&&ip.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return ip[0]===0||ip[0]===10||ip[0]===127||ip[0]===169&&ip[1]===254||ip[0]===172&&ip[1]>=16&&ip[1]<=31||ip[0]===192&&ip[1]===168||ip[0]===100&&ip[1]>=64&&ip[1]<=127||ip[0]===198&&(ip[1]===18||ip[1]===19);
  return false;
 }catch{return true;}
}
export function sanitizedURL(raw) {
  try { const u=new URL(raw); return `${u.origin}${u.pathname}`.slice(0,400); } catch { return ''; }
}
export function guard(tab, snapshot, now=Date.now()) {
  if (!safeURL(tab.url)) return '此页面不支持检测；选择普通网页后重试。';
  if (tab.incognito) return '隐身页面保持私密，不参与检测。';
  if (tab.pinned || tab.audible || tab.active || tab.discarded) return '当前使用、固定、播放声音或休眠中的页面会保留。';
  if (!snapshot || now-snapshot.at>15000) return '页面状态已过期；刷新检测后重试。';
  if (['waiting','unknown'].includes(snapshot.observed)) return '任务仍在等待或状态不明确，已保留。';
  if (snapshot.editable || snapshot.embedded || snapshot.dirty || snapshot.media || snapshot.visibility==='hidden-unknown') return '页面可能有编辑内容或媒体，已保留。';
  if (now-Math.max(snapshot.lastInteraction||0,tab.lastAccessed||0)<60000) return '页面最近有操作，稍后重新评估。';
  return null;
}
export function closeCandidate(tab, snapshot, decision, now=Date.now()) {
  return decision?.state==='close' && decision.confidence>=0.95 && !guard(tab,snapshot,now);
}
export function parseDecision(value) {
  if (!value || !STATES.includes(value.state) || typeof value.reason!=='string' || !value.reason.trim() || value.reason.length>240 || !Number.isFinite(value.confidence) || value.confidence<0 || value.confidence>1) throw new Error('模型返回格式无法识别；检查模型是否支持 JSON 输出后重试。');
  return {state:value.state,reason:value.reason.trim(),confidence:value.confidence};
}
export function pardon(record, now=Date.now()) {return {...record,state:'keep',closeAt:null,pardonedHash:record.hash,pardonUntil:now+30*60000,reason:'本次已保留；出现新变化后才重新评估。'};}
export function mayReevaluate(record, hash, now=Date.now()) {return !record || (now>=(record.pardonUntil||0) && hash!==record.pardonedHash);}
export function visibilityLease(lease, record, now=Date.now()) {return !!lease && lease.visible===true && lease.windowId===record.windowId && Array.isArray(lease.tabIds) && lease.tabIds.includes(record.tabId) && now-lease.at<=6000;}
export function mayClose(record, tab, snapshot, lease, now=Date.now(), nativeVisible=false) {
  const visible=record.closeSurface==='native'?nativeVisible===true:visibilityLease(lease,record,now);
  return record.state==='closing' && record.closeAt<=now && now-record.closeAt<5000 && tab.id===record.tabId && tab.windowId===record.windowId && tab.url===record.url && visible && !guard(tab,snapshot,now);
}
export function boundedEvidence(tab, snapshot) {
  // Query strings, fragments, form values and browsing history never enter model input.
  return {title:String(tab.title||'无标题页面').slice(0,160),url:sanitizedURL(tab.url),excerpt:String(snapshot?.excerpt||'').slice(0,1600),signals:{editable:!!snapshot?.editable,dirty:!!snapshot?.dirty,media:!!snapshot?.media,observed:snapshot?.observed||null}};
}
export async function fingerprint(evidence) {const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(evidence)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function dayKey(now=Date.now()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function reserve(ledger, settings, input, now=Date.now()) {
  const date=dayKey(now);
  const {requests=0,tokens=0}=ledger?.date===date?ledger:{};
  const current={date,requests,tokens};
  const tokenReserve=new TextEncoder().encode(JSON.stringify(input)).length+2048;
  return {ledger:{...current,requests:current.requests+1,tokens:current.tokens+tokenReserve},reserved:tokenReserve};
}
export function settle(ledger, reserved, usage, settings) {
  const incoming=usage?.input_tokens??usage?.prompt_tokens;
  const outgoing=usage?.output_tokens??usage?.completion_tokens;
  if(!Number.isFinite(incoming)||!Number.isFinite(outgoing)||incoming<0||outgoing<0)return ledger;
  return {...ledger,tokens:ledger.tokens-reserved+incoming+outgoing};
}
