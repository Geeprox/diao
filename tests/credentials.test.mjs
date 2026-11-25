import test from 'node:test';
import assert from 'node:assert/strict';
import {CredentialManager,credentialOrigin} from '../extension/core/credentials.mjs';
import {createConnectionSync,connectionSyncSlot} from '../extension/core/connection-sync.mjs';
import {createSyncPasskey,recoverSyncPasskey} from '../extension/core/passkey.mjs';
function area(){let data={};return {async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,structuredClone(data[k])]))},async set(values){Object.assign(data,structuredClone(values))},async clear(){data={}},snapshot(){return structuredClone(data)}};}
function setup({vault=new Map()}={}){
 const chrome={storage:{local:area(),session:area()},permissions:{async contains(){return true}}};let settings={endpoint:'https://api.openai.com/v1',rememberKey:false,credentialRevision:'first'},calls=[];
 const request=async(action,payload)=>{calls.push({action,origin:payload.origin,scope:payload.scope,interactive:payload.interactive});if(action==='save'){vault.set(payload.scope,{origin:payload.origin,apiKey:payload.apiKey});return {ok:true,saved:true}}if(action==='delete'){vault.delete(payload.scope);return {ok:true}}const item=vault.get(payload.scope);return item?.origin===payload.origin?{ok:true,found:true,...item}:{ok:true,found:false}};
 let serial=Promise.resolve();const mutate=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
 const make=(overrides={})=>new CredentialManager({chrome,request,settings:async()=>settings,mutate,...overrides});
 return {chrome,vault,calls,make,get settings(){return settings},set settings(next){settings=next}};
}
test('only HTTPS authority is used as the credential boundary',()=>{assert.equal(credentialOrigin('https://api.openai.com/v1'),'https://api.openai.com');for(const endpoint of ['http://api.openai.com','https://person:secret@example.com/v1','https://api.openai.com/v1?token=private'])assert.throws(()=>credentialOrigin(endpoint));});
test('remembering requires an explicit choice and never writes the secret to browser local storage',async()=>{const f=setup(),m=f.make();await m.prepareSave(f.settings,'synthetic-not-a-real-key',f.settings);assert.equal(f.calls.length,0);const next={...f.settings,rememberKey:true};await m.prepareSave(next,'synthetic-not-a-real-key',f.settings);assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'save');assert(!JSON.stringify(f.chrome.storage.local.snapshot()).includes('synthetic-not-a-real-key'));assert.equal(f.vault.size,1);});
test('a new browser session restores the saved key without importing or calling a model',async()=>{const f=setup(),first=f.make(),next={...f.settings,rememberKey:true,credentialRevision:'saved'};await first.prepareSave(next,'synthetic-saved-key',f.settings);f.settings=next;await f.chrome.storage.session.clear();const restarted=f.make();assert.equal(await restarted.restore(f.settings),true);assert.equal(f.chrome.storage.session.snapshot().apiKey,'synthetic-saved-key');assert.equal(f.chrome.storage.session.snapshot().apiKeyOrigin,'https://api.openai.com');assert.equal(f.calls.filter(c=>c.action==='load').length,1);assert(!JSON.stringify(f.chrome.storage.local.snapshot()).includes('synthetic-saved-key'));});
test('worker sleep with an already cached session does not reread Keychain',async()=>{const f=setup();f.settings={...f.settings,rememberKey:true};await f.chrome.storage.session.set({apiKey:'synthetic-session',apiKeyOrigin:'https://api.openai.com',apiKeyRevision:f.settings.credentialRevision});assert(await f.make().restore(f.settings));assert.equal(f.calls.length,0);});
test('a saved key can never restore to a different API origin or a revoked origin permission',async()=>{const f=setup(),m=f.make(),next={...f.settings,rememberKey:true};await m.prepareSave(next,'synthetic-origin-key',f.settings);f.settings={...next,endpoint:'https://different.example/v1'};assert.equal(await f.make().restore(f.settings),false);assert.equal(f.chrome.storage.session.snapshot().apiKey,undefined);f.chrome.permissions.contains=async()=>false;f.settings=next;const before=f.calls.length;assert.equal(await f.make().restore(f.settings),false);assert.equal(f.calls.length,before);});
test('a delayed restore cannot resurrect a key after forgetting the connection',async()=>{const f=setup();f.settings={...f.settings,rememberKey:true};let release,started;const ready=new Promise(r=>started=r);const m=f.make({request:async(action,payload)=>{if(action==='load'){started();return new Promise(r=>release=()=>r({found:true,origin:payload.origin,apiKey:'synthetic-race-key'}))}return {ok:true}}});const pending=m.restore(f.settings);await ready;await m.forget(f.settings);f.settings={...f.settings,rememberKey:false};release();assert.equal(await pending,false);assert.equal(f.chrome.storage.session.snapshot().apiKey,undefined);});
test('failed background restoration is not repeatedly retried; explicit recovery can try again',async()=>{const f=setup();f.settings={...f.settings,rememberKey:true};let attempts=0,allow=false;const m=f.make({request:async(action,payload)=>{attempts++;if(!allow)throw Error('Keychain is locked');return {found:true,origin:payload.origin,apiKey:'synthetic-recovered-key'}}});assert.equal(await m.restore(f.settings),false);assert.equal(await m.restore(f.settings),false);assert.equal(attempts,1);assert.equal(f.settings.rememberKey,true);allow=true;assert(await m.restore(f.settings,{interactive:true,force:true}));assert.equal(attempts,2);});
test('browser profiles get distinct keychain accounts and remembering can be disabled without dropping the session key',async()=>{const vault=new Map(),a=setup({vault}),b=setup({vault}),ma=a.make(),mb=b.make();const next={...a.settings,rememberKey:true};await ma.prepareSave(next,'synthetic-profile-a',a.settings);await mb.prepareSave(next,'synthetic-profile-b',b.settings);assert.equal(vault.size,2);assert.notEqual(await ma.namespace(),await mb.namespace());a.settings=next;await a.chrome.storage.session.set({apiKey:'synthetic-profile-a',apiKeyOrigin:'https://api.openai.com',apiKeyRevision:next.credentialRevision});const retained=await ma.prepareSave({...next,rememberKey:false},'',next);assert.equal(retained.apiKey,'synthetic-profile-a');assert.equal(vault.size,1);});

test('blank save after session loss verifies and recovers the actual saved item',async()=>{
 const f=setup(),m=f.make(),next={...f.settings,rememberKey:true};await m.prepareSave(next,'synthetic-durable-key',f.settings);f.settings=next;await f.chrome.storage.session.clear();
 const result=await f.make().prepareSave(next,'',next);assert.equal(result.apiKey,'synthetic-durable-key');assert.equal(result.persisted,true);assert.equal(f.calls.at(-1).action,'load');
});
test('remembered flag without a saved item cannot claim that a blank save succeeded',async()=>{
 const f=setup();f.settings={...f.settings,rememberKey:true};await assert.rejects(f.make().prepareSave(f.settings,'',f.settings),/尚无/);assert.equal(f.vault.size,0);
});
test('a session key is actually persisted even when rememberKey was already enabled',async()=>{
 const f=setup();f.settings={...f.settings,rememberKey:true};await f.chrome.storage.session.set({apiKey:'synthetic-session-only',apiKeyOrigin:'https://api.openai.com',apiKeyRevision:f.settings.credentialRevision});const r=await f.make().prepareSave(f.settings,'',f.settings);assert.equal(r.persisted,true);assert.equal(f.calls.at(-1).action,'save');assert.equal(f.vault.size,1);
});
test('temporary background denial can recover after cooldown without importing again',async()=>{
 const f=setup();f.settings={...f.settings,rememberKey:true};let now=1000,allowed=false,calls=0;const m=f.make({now:()=>now,request:async(action,payload)=>{calls++;if(!allowed)throw Object.assign(Error('解锁并恢复'),{code:'keychain_auth_required',requiresInteraction:true});return {found:true,origin:payload.origin,apiKey:'synthetic-retry-key'};}});
 assert.equal(await m.restore(f.settings),false);assert.equal(f.chrome.storage.session.snapshot().credentialStatus.phase,'unlock_required');now+=10000;assert.equal(await m.restore(f.settings),false);assert.equal(calls,1);allowed=true;now+=21000;assert.equal(await m.restore(f.settings),true);assert.equal(calls,2);assert.equal(f.chrome.storage.session.snapshot().credentialPersistedOrigin,'https://api.openai.com');
});

test('a save acknowledgement without verified persistence cannot be shown as saved',async()=>{
 const f=setup();const next={...f.settings,rememberKey:true};await assert.rejects(f.make({request:async()=>({ok:true})}).prepareSave(next,'synthetic-unverified',f.settings),/未确认长期保存/);
});


test('加密同步在新设备解锁后恢复，换密钥沿用原口令，删除后停止恢复',async()=>{
 const cloud=area();
 cloud.remove=async key=>cloud.set({[key]:null});
 const device=()=>{
  let localKey;
  return {async loadSyncKey(salt){return localKey?.salt===salt?localKey.key:null;},
    async saveSyncKey(salt,key){assert.equal(key.extractable,false);localKey={salt,key};},
    async removeSyncKey(){localKey=null;}};
 };
 const first=createConnectionSync({storage:cloud,vault:device()});
 const secondVault=device(),second=createConnectionSync({storage:cloud,vault:secondVault});
 const settings={provider:'decisions',endpoint:'https://api.openai.com/v1',model:'gpt-6-luna'};
 const passphrase='twenty-safe-words-fixture';
 const old=await first.save(settings,'synthetic-sync-first',passphrase);
 const sorted = cloud.snapshot()[connectionSyncSlot];
 await cloud.set({[connectionSyncSlot]:{...sorted,settings:{endpoint:settings.endpoint,model:settings.model,provider:settings.provider}}});
 assert.deepEqual(await second.info(),{id:old,settings});
 assert(!JSON.stringify(cloud.snapshot()).includes('synthetic-sync-first'));
 assert(!JSON.stringify(cloud.snapshot()).includes(passphrase));
 await assert.rejects(second.load(),{code:'sync_unlock_required'});
 await assert.rejects(second.load({id:old,passphrase:'incorrect sync passphrase'}),/口令不正确/);
 assert.equal((await second.load({id:old,passphrase})).apiKey,'synthetic-sync-first');
 const newer=await first.save(settings,'synthetic-sync-updated','',old);
 const restarted=createConnectionSync({storage:cloud,vault:secondVault});
 assert.equal((await restarted.load()).apiKey,'synthetic-sync-updated');
 await assert.rejects(second.remove(old),/已变更/);
 const valid=cloud.snapshot()[connectionSyncSlot];
 await cloud.set({[connectionSyncSlot]:{...valid,settings:{...settings,provider:'chat',endpoint:'https://other.example/v1'}}});
 await assert.rejects(restarted.load(),/口令不正确/);
 await cloud.set({[connectionSyncSlot]:valid});
 await restarted.remove(newer);
 assert.equal(await first.info(),null);
 await assert.rejects(first.load(),/已变更/);
});

function syncVault() {
 const keys = new Map();
 return {
  keys,
  async loadSyncKey(scope) { return keys.get(scope); },
  async saveSyncKey(scope, key) {
   assert.equal(key.extractable, false);
   keys.set(scope, key);
  },
  async removeSyncKey(scope) { keys.delete(scope); },
 };
}

const openAI = {provider: 'decisions', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna'};
const rawCredentialId = new Uint8Array(32).fill(74);
const rawPasskeyKey = new Uint8Array(32).fill(193);
const encodeURL = bytes => Buffer.from(bytes).toString('base64url');

function fixtureCredential({id = rawCredentialId, key = rawPasskeyKey, backup = true, prf = true} = {}) {
 const authenticatorData = new Uint8Array(37);
 authenticatorData[32] = 0x05 | (backup ? 0x08 : 0);
 return {
  type: 'public-key',
  rawId: id,
  response: {authenticatorData, getAuthenticatorData: () => authenticatorData},
  getClientExtensionResults: () => ({prf: {enabled: prf, ...(key ? {results: {first: key}} : {})}}),
 };
}

test('通行密钥在扩展源上要求设备验证，第二台设备使用同一凭据与 PRF 盐', async () => {
 let originalSalt, originalChallenge;
 const enrolled = await createSyncPasskey({
  async create({publicKey}) {
   assert.equal(publicKey.rp.id, undefined);
   assert.equal(publicKey.authenticatorSelection.userVerification, 'required');
   assert.equal(publicKey.authenticatorSelection.residentKey, 'required');
   originalChallenge = publicKey.challenge;
   originalSalt = publicKey.extensions.prf.eval.first;
   return fixtureCredential();
  },
  async get() { assert.fail('创建已返回 PRF，只需一次通行密钥验证'); },
 });
 assert.equal(enrolled.passkey.credentialId, encodeURL(rawCredentialId));
 assert.equal(enrolled.passkey.salt, encodeURL(originalSalt));
 assert.equal(enrolled.passkeyKey, encodeURL(rawPasskeyKey));

 const fromSecondDevice = await recoverSyncPasskey(enrolled.passkey, {
  async create() { assert.fail('新设备不应再建通行密钥'); },
  async get({publicKey}) {
   assert.equal(publicKey.rpId, undefined);
   assert.equal(publicKey.userVerification, 'required');
   assert.notDeepEqual(publicKey.challenge, originalChallenge);
   assert.deepEqual(publicKey.allowCredentials[0].id, rawCredentialId);
   assert.deepEqual(publicKey.extensions.prf.eval.first, originalSalt);
   return fixtureCredential();
  },
 });
 assert.equal(fromSecondDevice, enrolled.passkeyKey);
});

test('通行密钥缺少注册 PRF 输出时按原凭据核验，设备专用与不支持 PRF 的凭据不得启用同步', async () => {
 let assertions = 0;
 const fallback = await createSyncPasskey({
  async create() { return fixtureCredential({key: null}); },
  async get() { assertions++; return fixtureCredential(); },
 });
 assert.equal(fallback.passkeyKey, encodeURL(rawPasskeyKey));
 assert.equal(assertions, 1);
 await assert.rejects(createSyncPasskey({
  async create() { return fixtureCredential({backup: false}); },
  async get() { assert.fail('设备专用凭据不参与同步'); },
 }), /设备间同步/);
 await assert.rejects(createSyncPasskey({
  async create() { return fixtureCredential({prf: false}); },
  async get() { assert.fail('不支持 PRF 的凭据不参与同步'); },
 }), /不支持加密同步/);
 await assert.rejects(recoverSyncPasskey(fallback.passkey, {
  async create() { assert.fail(); },
  async get() { return fixtureCredential({id: new Uint8Array(32).fill(85)}); },
 }), /不匹配/);
});

test('同步仅保存密文，新设备经一次通行密钥验证恢复，后续轮换和重启无需再验证', async () => {
 const cloud = area();
 cloud.remove = async key => cloud.set({[key]: null});
 const source = createConnectionSync({storage: cloud, vault: syncVault()});
 const targetVault = syncVault();
 const target = createConnectionSync({storage: cloud, vault: targetVault});
 const {passkey, passkeyKey} = await createSyncPasskey({
  async create() { return fixtureCredential(); },
  async get() { assert.fail(); },
 });
 const secret = 'test-only-OpenAI-key';
 const revision = await source.save({...openAI, apiKey: secret}, secret, '', '', {passkey, passkeyKey});
 const record = cloud.snapshot()[connectionSyncSlot];
 assert.equal(record.version, 2);
 assert.deepEqual(record.settings, openAI);
 assert(!JSON.stringify(record).includes(secret));
 assert(!JSON.stringify(record).includes(passkeyKey));
 assert.deepEqual(await target.info(), {id: revision, settings: openAI, passkey});
 await assert.rejects(target.load(), {code: 'sync_unlock_required'});
 await assert.rejects(target.load({id: revision, passkeyKey: encodeURL(new Uint8Array(32).fill(1))}), /无法解锁/);
 assert.equal(targetVault.keys.size, 0);
 assert.equal((await target.load({id: revision, passkeyKey})).apiKey, secret);
 assert.equal(targetVault.keys.size, 1);

 const restarted = createConnectionSync({storage: cloud, vault: targetVault});
 assert.equal((await restarted.load()).apiKey, secret);
 assert.equal(await restarted.save(openAI, secret, '', revision), revision);
 const rotated = await source.save(openAI, 'rotated-test-only-OpenAI-key', '', revision);
 assert.equal((await restarted.load({id: rotated})).apiKey, 'rotated-test-only-OpenAI-key');
 await assert.rejects(restarted.load({id: revision}), /已变更/);

 const valid = cloud.snapshot()[connectionSyncSlot];
 await cloud.set({[connectionSyncSlot]: {...valid, settings: {...openAI, provider: 'responses', endpoint: 'https://other.example/v1'}}});
 await assert.rejects(restarted.load(), /无法解锁/);
 await cloud.set({[connectionSyncSlot]: valid});
 await restarted.remove(rotated);
 assert.equal(targetVault.keys.size, 0);
 await assert.rejects(source.load(), /已变更/);

 const otherAccount = createConnectionSync({storage: area(), vault: syncVault()});
 assert.equal(await otherAccount.info(), null);
});

test('旧口令记录可在原设备升级，升级写入中断时旧设备仍可恢复', async () => {
 const cloud = area();
 const originalSet = cloud.set;
 const vault = syncVault();
 const source = createConnectionSync({storage: cloud, vault});
 const secret = 'legacy-test-only-key';
 const oldRevision = await source.save(openAI, secret, 'synthetic-legacy-passphrase');
 const newPasskey = await createSyncPasskey({
  async create() { return fixtureCredential(); },
  async get() { assert.fail(); },
 });
 cloud.set = async () => { throw Error('测试写入未完成'); };
 await assert.rejects(source.save(openAI, secret, '', oldRevision, newPasskey), /写入未完成/);
 assert.equal((await source.load({id: oldRevision})).apiKey, secret);
 assert.equal(vault.keys.size, 1);
 cloud.set = originalSet;

 const revision = await source.save(openAI, secret, '', oldRevision, newPasskey);
 assert.notEqual(revision, oldRevision);
 assert.equal(vault.keys.size, 1);
 assert.equal((await source.load({id: revision})).apiKey, secret);
 const fresh = createConnectionSync({storage: cloud, vault: syncVault()});
 assert.deepEqual((await fresh.info()).passkey, newPasskey.passkey);
 await assert.rejects(fresh.load({passphrase: 'synthetic-legacy-passphrase'}), {code: 'sync_unlock_required'});
});

test('已缓存的同地址密钥仍需匹配连接修订与当前授权', async () => {
 const f = setup();
 const manager = f.make();
 const latest = {...f.settings, rememberKey: true, credentialRevision: 'latest'};
 await manager.prepareSave(latest, 'latest-test-key', f.settings);
 f.settings = latest;
 await f.chrome.storage.session.set({apiKey: 'stale-test-key', apiKeyOrigin: 'https://api.openai.com', apiKeyRevision: 'earlier'});
 assert.equal(await manager.restore(latest), true);
 assert.equal(f.chrome.storage.session.snapshot().apiKey, 'latest-test-key');
 assert.equal(f.chrome.storage.session.snapshot().apiKeyRevision, 'latest');
 const priorReads = f.calls.length;
 f.chrome.permissions.contains = async () => false;
 assert.equal(await manager.restore(latest), false);
 assert.equal(f.calls.length, priorReads);
});

test('从兼容服务切回 OpenAI 时自动选回保存的同地址密钥', async () => {
 const entries = new Map();
 const profile = {
  async load(origin) {
   return entries.has(origin) ? {found: true, origin, apiKey: entries.get(origin)} : {found: false};
  },
  async save(origin, apiKey) { entries.set(origin, apiKey); return {saved: true}; },
  async remove(origin) { entries.delete(origin); },
 };
 const f = setup(), manager = f.make({profile});
 const official = {...f.settings, rememberKey: true, credentialStorage: 'profile'};
 await manager.prepareSave(official, 'test-only-openai-key', f.settings);
 const compatible = {...official, endpoint: 'https://compatible.example/v1', credentialRevision: 'compatible'};
 await manager.prepareSave(compatible, 'test-only-compatible-key', official);
 assert.equal(entries.size, 2);
 await f.chrome.storage.session.set({
  apiKey: 'test-only-compatible-key', apiKeyOrigin: 'https://compatible.example', apiKeyRevision: 'compatible',
 });
 const restored = await manager.prepareSave({...official, provider: 'responses'}, '', compatible);
 assert.equal(restored.apiKey, 'test-only-openai-key');
 assert.equal(restored.origin, 'https://api.openai.com');
 assert.equal(entries.size, 2);
});

test('切回已解锁的 OpenAI 同步连接时从现有修订恢复，不覆盖兼容服务的密钥', async () => {
 const f = setup();
 const profile = syncVault();
 f.chrome.storage.sync = area();
 const manager = f.make({profile});
 const passkey = await createSyncPasskey({
  async create() { return fixtureCredential(); },
  async get() { assert.fail(); },
 });
 const revision = await manager.sync.save(openAI, 'test-only-synced-openai-key', '', '', passkey);
 const previous = {
  ...f.settings, rememberKey: true, credentialStorage: 'profile', endpoint: 'https://compatible.example/v1',
 };
 f.settings = previous;
 await f.chrome.storage.session.set({
  apiKey: 'test-only-compatible-key', apiKeyOrigin: 'https://compatible.example', apiKeyRevision: previous.credentialRevision,
 });
 const next = {...previous, ...openAI, credentialStorage: 'sync'};
 const restored = await manager.prepareSave(next, '', previous, {expectedId: revision});
 assert.equal(restored.apiKey, 'test-only-synced-openai-key');
 assert.equal(restored.origin, 'https://api.openai.com');
 assert.equal(next.credentialRevision, revision);
});
