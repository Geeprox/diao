// 使用当前扩展配置文件的 IndexedDB。网页和普通内容脚本不访问这个扩展源。
export function createProfileVault() {
  let connection;
  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('tab-cadence-credentials', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('connection');
        request.onerror = () => reject(new Error('无法打开当前 Chrome 配置的密钥存储。'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); connection = null; };
          resolve(db);
        };
      }).catch(error => { connection = null; throw error; });
    }
    return connection;
  }
  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('connection', mode);
      const request = operation(tx.objectStore('connection'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error('无法访问当前 Chrome 配置中的密钥。'));
    });
  }
  const aad = origin => new TextEncoder().encode('Tab Cadence API v1 ' + origin);
  async function load(origin) {
    const record = await transact('readonly', store => store.get(origin));
    if (!record) return {found:false};
    if (record.version !== 1 || record.origin !== origin) throw new Error('保存的模型连接与 API 地址不符。');
    let value;
    try {
      value = await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:aad(origin)}, record.key, record.ciphertext);
    } catch {
      throw new Error('当前 Chrome 配置无法解锁已保存的密钥。');
    }
    return {found:true,origin,apiKey:new TextDecoder().decode(value)};
  }
  async function save(origin, apiKey) {
    const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(origin)}, key, new TextEncoder().encode(apiKey));
    await transact('readwrite', store => store.put({version:1, origin, key, iv, ciphertext},origin));
    return {saved:(await load(origin)).apiKey === apiKey};
  }
  async function remove(origin) {
    await transact('readwrite', store => store.delete(origin));
    return {ok:true};
  }
  const syncStorageKey = scope => 'sync-unlock:' + scope;
  async function loadSyncKey(scope) {
    const key = await transact('readonly', store => store.get(syncStorageKey(scope)));
    if (key) return key;
    // 兼容先前由口令解锁的配置。通行密钥使用各自的记录，迁移失败时不会覆盖旧口令密钥。
    const legacy = await transact('readonly', store => store.get('sync-unlock'));
    return legacy?.salt === scope ? legacy.key : null;
  }
  const saveSyncKey = (scope, key) => transact('readwrite', store => store.put(key, syncStorageKey(scope)));
  async function removeSyncKey(scope) {
    await transact('readwrite', store => {
      const legacy = store.get('sync-unlock');
      legacy.onsuccess = () => {
        if (legacy.result?.salt === scope) store.delete('sync-unlock');
      };
      return store.delete(syncStorageKey(scope));
    });
  }
  return {load,save,remove,loadSyncKey,saveSyncKey,removeSyncKey};
}
