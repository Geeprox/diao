import {createProfileVault} from './profile-vault.mjs';
import {createConnectionSync} from './connection-sync.mjs';

export function credentialOrigin(endpoint){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('密钥只可保存给已授权的 HTTPS API 地址。');
 return url.origin;
}
export function credentialStorage(settings) {
 if (['profile','sync'].includes(settings.credentialStorage) && settings.rememberKey === true) return settings.credentialStorage;
 return settings.rememberKey === true ? 'keychain' : 'session';
}
const savedReason = mode => mode === 'sync' ? '已连接 · Chrome 同步' : mode === 'profile' ?
 '已保存在当前 Chrome 配置，更新或重启后会自动恢复。' :
 '已保存到 macOS 钥匙串，更新或重启后会自动恢复。';
const validKey=key=>typeof key==='string'&&key.length>0&&key.length<=512&&!/[\r\n\0]/.test(key);
export class CredentialManager {
 constructor({chrome,request,settings,mutate,changed=()=>{},now=()=>Date.now(),profile=createProfileVault()}){Object.assign(this,{chrome,request,settings,mutate,changed,now,profile});this.epoch=0;this.attempts=new Map();this.namespacePromise=null;this.sync=createConnectionSync({storage:chrome.storage.sync,vault:profile});}
 async namespace(){
  if(!this.namespacePromise)this.namespacePromise=(async()=>{const {credentialNamespace}=await this.chrome.storage.local.get('credentialNamespace');if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialNamespace||''))return credentialNamespace;const scope=crypto.randomUUID();await this.chrome.storage.local.set({credentialNamespace:scope});return scope;})().catch(error=>{this.namespacePromise=null;throw error;});
  return this.namespacePromise;
 }
 async stored(mode, action, origin, interactive, apiKey, revision) {
  if (mode === 'sync' && action === 'load') {
   const {settings,apiKey} = await this.sync.load({id:revision});
   return {found:true,origin:credentialOrigin(settings.endpoint),apiKey};
  }
  if (mode === 'profile') {
   if (action === 'load') return this.profile.load(origin);
   if (action === 'save') return this.profile.save(origin, apiKey);
   return this.profile.remove(origin);
  }
  return this.request(action,{scope:await this.namespace(),origin,interactive,...(apiKey?{apiKey}:{})});
 }
 invalidate(){this.epoch++;this.attempts.clear();}
 async status(phase,reason){await this.chrome.storage.session.set({credentialStatus:{phase,reason}});this.changed();}
 restore(settings,{interactive=false,force=false}={}){
  const mode = credentialStorage(settings);
  if (mode === 'session') return Promise.resolve(false);
  const origin=credentialOrigin(settings.endpoint),revision=settings.credentialRevision||'',signature=[origin,revision,mode].join('|');
  if(force)this.invalidate();
  const prior=this.attempts.get(signature);
  if(prior&&this.now()<prior.retryAt)return prior.promise;
  const epoch=this.epoch,entry={retryAt:Infinity,failures:prior?.failures||0};
  const pending=(async()=>{
   try{
    if(!await this.chrome.permissions.contains({origins:[origin+'/*']}))throw Error('请授权当前 API 地址后再恢复连接。');
    if(epoch!==this.epoch)return false;
    if(!force){
     const cached=await this.chrome.storage.session.get(['apiKey','apiKeyOrigin','apiKeyRevision']);
     if(epoch!==this.epoch)return false;
     if(validKey(cached.apiKey)&&cached.apiKeyOrigin===origin&&(cached.apiKeyRevision||'')===revision)return true;
    }
    await this.status('restoring','正在恢复已保存的连接…');
    const result=await this.stored(mode,'load',origin,interactive,undefined,revision);
    if(!result.found){
     entry.retryAt=this.now()+30000;
     if(epoch===this.epoch)await this.status('missing','还没有保存此 API 地址的密钥。');
     return false;
    }
    if(result.origin!==origin||!validKey(result.apiKey))throw Error('已保存连接的地址或格式不匹配，未恢复密钥。');
    const restored=await this.mutate(async()=>{
     const current=await this.settings();
     if(epoch!==this.epoch||credentialStorage(current)!==mode||credentialOrigin(current.endpoint)!==origin||(current.credentialRevision||'')!==revision)return false;
     await this.chrome.storage.session.set({
      apiKey:result.apiKey,apiKeyOrigin:origin,apiKeyRevision:revision,credentialPersistedOrigin:origin,
      credentialStatus:{phase:'ready',persisted:true,storage:mode,reason:savedReason(mode)},
     });
     return true;
    });
    if(restored)this.changed();return restored;
   }catch(error){
    entry.failures++;entry.retryAt=this.now()+Math.min(30000*4**(entry.failures-1),600000);
    const unlock=error.requiresInteraction||error.code==='sync_unlock_required'||['keychain_auth_required','keychain_locked'].includes(error.code);
    if(epoch===this.epoch)await this.status(unlock?'unlock_required':'unavailable',error.message||'连接暂时无法恢复，可解锁后重试，无需重新导入密钥。');
    return false;
   }finally{
    if(entry.retryAt===Infinity&&this.attempts.get(signature)===entry)this.attempts.delete(signature);
   }
  })();
  entry.promise=pending;this.attempts.set(signature,entry);if(this.attempts.size>8)this.attempts.delete(this.attempts.keys().next().value);return pending;
 }
 async prepareSave(next,supplied,previous,syncOptions={}){
  this.invalidate();
  const origin = credentialOrigin(next.endpoint);
  const oldOrigin = credentialOrigin(previous.endpoint);
  const mode = credentialStorage(next), oldMode = credentialStorage(previous);
  const sameConnection = origin === oldOrigin && mode === oldMode;
  const session = await this.chrome.storage.session.get(['apiKey','apiKeyOrigin','apiKeyRevision']);
  const provided = typeof supplied === 'string' ? supplied.trim() : '';
  const currentSession = session.apiKeyOrigin === origin && oldOrigin === origin &&
    (session.apiKeyRevision || '') === (previous.credentialRevision || '');
  let key = provided || (currentSession ? session.apiKey : '') || '';
  let storedInTarget = false;
  if (!key) {
   const previousSaved = origin === oldOrigin && oldMode !== 'session';
   const targetSaved = mode === 'profile' || (mode === 'sync' && syncOptions.expectedId);
   const source = previousSaved ? oldMode : targetSaved ? mode : null;
   const revision = previousSaved ? previous.credentialRevision : syncOptions.expectedId;
   const saved = source && await this.stored(source, 'load', origin, true, undefined, revision);
   if (saved?.found) {
    if (saved.origin !== origin || !validKey(saved.apiKey)) throw Error('已保存连接的地址或格式不匹配。');
    key = saved.apiKey;
    storedInTarget = source === mode;
   }
  }
  if (key && !validKey(key)) throw Error('检查 API Key 的长度和格式。');
  if (mode === 'sync') {
   if (!key) throw Error('先填写或导入 API Key，再启用同步。');
   const {provider,endpoint,model} = next;
   const {passphrase,expectedId,passkey,passkeyKey,pairingCode} = syncOptions;
   next.credentialRevision = await this.sync.save({provider,endpoint,model},key,passphrase,expectedId,{passkey,passkeyKey,pairingCode});
  } else if (mode !== 'session' && !storedInTarget) {
   if (!key) throw Error('尚无此 API 地址的密钥，请填写或导入一次。');
   const result = await this.stored(mode,'save',origin,true,key);
   if (result.saved !== true) throw Error('未确认长期保存，请检查密钥存储后重试。');
  }
  // Chrome 配置按 API origin 保存。切换服务时保留另一服务已保存的密钥。
  const preserveDormantProfile = oldMode === 'profile' && origin !== oldOrigin;
  const removeOld = !['session','sync'].includes(oldMode) && mode !== 'sync' && !sameConnection &&
    !preserveDormantProfile && !(oldMode === 'keychain' && mode === oldMode);
  if (removeOld) {
   try {
    await this.stored(oldMode, 'delete', oldOrigin, true);
   } catch (error) {
    if (mode !== 'session') await this.stored(mode, 'delete', origin, true).catch(()=>{});
    throw error;
   }
  }
  return {apiKey:key,origin,persisted:mode !== 'session',storage:mode,
   reason:mode==='session'?'密钥仅在当前会话可用。':savedReason(mode)};
 }
 async forget(settings) {
  this.invalidate();
  const mode = credentialStorage(settings);
  if (mode === 'sync') {
   await this.sync.remove(settings.credentialRevision);
   await this.profile.remove(credentialOrigin(settings.endpoint));
  } else if (mode !== 'session') await this.stored(mode, 'delete', credentialOrigin(settings.endpoint), true);
 }
}
