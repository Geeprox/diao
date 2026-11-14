export function credentialOrigin(endpoint){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('密钥只可保存给已授权的 HTTPS API 地址。');
 return url.origin;
}
const validKey=key=>typeof key==='string'&&key.length>0&&key.length<=512&&!/[\r\n\0]/.test(key);
export class CredentialManager {
 constructor({chrome,request,settings,mutate,changed=()=>{},now=()=>Date.now()}){Object.assign(this,{chrome,request,settings,mutate,changed,now});this.epoch=0;this.attempts=new Map();this.namespacePromise=null;}
 async namespace(){
  if(!this.namespacePromise)this.namespacePromise=(async()=>{const {credentialNamespace}=await this.chrome.storage.local.get('credentialNamespace');if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialNamespace||''))return credentialNamespace;const scope=crypto.randomUUID();await this.chrome.storage.local.set({credentialNamespace:scope});return scope;})().catch(error=>{this.namespacePromise=null;throw error;});
  return this.namespacePromise;
 }
 invalidate(){this.epoch++;this.attempts.clear();}
 async status(phase,reason){await this.chrome.storage.session.set({credentialStatus:{phase,reason}});this.changed();}
 restore(settings,{interactive=false,force=false}={}){
  if(settings.rememberKey!==true)return Promise.resolve(false);
  const origin=credentialOrigin(settings.endpoint),revision=settings.credentialRevision||'',signature=origin+'|'+revision;
  if(force)this.invalidate();
  const prior=this.attempts.get(signature);
  if(prior&&this.now()<prior.retryAt)return prior.promise;
  const epoch=this.epoch,entry={retryAt:Infinity,failures:prior?.failures||0};
  const pending=(async()=>{
   try{
    if(!force){const cached=await this.chrome.storage.session.get(['apiKey','apiKeyOrigin']);if(validKey(cached.apiKey)&&cached.apiKeyOrigin===origin)return true;}
    if(!await this.chrome.permissions.contains({origins:[origin+'/*']}))throw Error('请保存连接，授权当前 API 地址后再恢复。');
    await this.status('restoring','正在恢复已保存的连接…');
    const result=await this.request('load',{scope:await this.namespace(),origin,interactive});
    if(!result.found){if(epoch===this.epoch)await this.status('missing','钥匙串中尚无此地址的连接。首次配置时填写一次并保存。');return false;}
    if(result.origin!==origin||!validKey(result.apiKey))throw Error('已保存连接的地址或格式不匹配，未恢复密钥。');
    const restored=await this.mutate(async()=>{const current=await this.settings();if(epoch!==this.epoch||current.rememberKey!==true||credentialOrigin(current.endpoint)!==origin||(current.credentialRevision||'')!==revision)return false;await this.chrome.storage.session.set({apiKey:result.apiKey,apiKeyOrigin:origin,credentialPersistedOrigin:origin,credentialStatus:{phase:'ready',persisted:true,reason:'连接已恢复，密钥保存在这台 Mac 的钥匙串中。'}});return true;});
    if(restored)this.changed();return restored;
   }catch(error){
    entry.failures++;entry.retryAt=this.now()+Math.min(30000*4**(entry.failures-1),600000);
    const unlock=error.requiresInteraction||['keychain_auth_required','keychain_locked'].includes(error.code);
    if(epoch===this.epoch)await this.status(unlock?'unlock_required':'unavailable',error.message||'连接暂时无法恢复，可解锁后重试，无需重新导入密钥。');
    return false;
   }
  })();
  entry.promise=pending;this.attempts.set(signature,entry);if(this.attempts.size>8)this.attempts.delete(this.attempts.keys().next().value);return pending;
 }
 async prepareSave(next,supplied,previous){
  this.invalidate();const origin=credentialOrigin(next.endpoint),session=await this.chrome.storage.session.get(['apiKey','apiKeyOrigin']);
  const provided=typeof supplied==='string'?supplied.trim():'';let key=provided||(session.apiKeyOrigin===origin?session.apiKey:'')||'';
  if(key&&!validKey(key))throw Error('检查 API Key 的长度和格式。');
  let persisted=false;
  if(next.rememberKey===true){
   // 只在钥匙串实际保存或读取成功后报告长期保存，不能以勾选状态代替结果。
   if(key){const result=await this.request('save',{scope:await this.namespace(),origin,apiKey:key,interactive:true});if(result.saved!==true)throw Error('辅助程序未确认长期保存，连接尚未标记为已保存。请更新辅助程序后重试。');persisted=true;}
   else{
    const saved=await this.request('load',{scope:await this.namespace(),origin,interactive:true});
    if(!saved.found)throw Error('钥匙串中尚无此地址的连接。首次配置时填写或导入一次 API Key，再保存。');
    if(saved.origin!==origin||!validKey(saved.apiKey))throw Error('已保存连接的地址或格式不匹配，未恢复密钥。');
    key=saved.apiKey;persisted=true;
   }
  }else if(previous.rememberKey===true){await this.request('delete',{scope:await this.namespace(),interactive:true});}
  return {apiKey:key,origin,persisted};
 }
 async forget(settings){this.invalidate();if(settings.rememberKey===true)await this.request('delete',{scope:await this.namespace(),interactive:true});}
}
