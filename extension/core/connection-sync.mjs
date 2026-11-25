import {normalizeSyncPasskey, syncPasskeyKeyBytes} from './passkey.mjs';
import {buildRequest} from './providers.mjs';

const slot = 'encryptedModelConnection';
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const random = count => encode(crypto.getRandomValues(new Uint8Array(count)));
const fields = ({provider, endpoint, model}) => [provider, endpoint, model];
const validKey = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\r\n\0]/.test(value);

function connectionSettings(value) {
  const {provider, endpoint, model} = value ?? {};
  const settings = {provider, endpoint, model};
  if (!fields(settings).every(field => typeof field === 'string' && field.length > 0 && field.length <= 512)) {
    throw Error('同步连接的设置格式有误。');
  }
  buildRequest(settings, {});
  return settings;
}

function keyScope(record) {
  return record.version === 1 ? record.salt : [record.passkey.credentialId, record.passkey.salt].join('.');
}

function additionalData(record) {
  const unlock = record.version === 1 ? [record.salt] : [record.passkey.credentialId, record.passkey.salt];
  return encoder.encode(JSON.stringify([record.version, record.id, ...unlock, ...fields(record.settings)]));
}

async function fromPassphrase(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: decode(salt), iterations: 600000, hash: 'SHA-256'},
    material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'],
  );
}

async function fromPasskey(passkeyKey, passkey) {
  const bytes = syncPasskeyKeyBytes(passkeyKey);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
    // PRF 结果只作为此功能的根材料，持久化的派生密钥不可导出。
    return await crypto.subtle.deriveKey({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(passkey.salt),
      info: encoder.encode('Tab Cadence model connection v2 ' + passkey.credentialId),
    }, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  } finally {
    bytes.fill(0);
  }
}

async function decrypt(record, key) {
  let apiKey;
  try {
    apiKey = new TextDecoder().decode(await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: decode(record.iv), additionalData: additionalData(record)}, key, decode(record.ciphertext),
    ));
  } catch {
    throw Error(record.version === 1 ? '同步口令不正确，或同步记录已损坏。' : '此通行密钥无法解锁已保存的连接。');
  }
  if (!validKey(apiKey)) throw Error('同步记录中的 API Key 格式有误。');
  return apiKey;
}

function decodeRecord(record) {
  if (![1, 2].includes(record.version) || !/^[0-9a-f-]{36}$/i.test(record.id) ||
      typeof record.iv !== 'string' || record.iv.length !== 16 || decode(record.iv).length !== 12 ||
      typeof record.ciphertext !== 'string' || record.ciphertext.length > 720) {
    throw Error('无法读取同步连接。');
  }
  const unlock = record.version === 2 ? {passkey: normalizeSyncPasskey(record.passkey)} : {salt: record.salt};
  if (record.version === 1 && (typeof record.salt !== 'string' || record.salt.length !== 24 || decode(record.salt).length !== 16)) {
    throw Error('无法读取同步连接。');
  }
  return {version: record.version, id: record.id, ...unlock, iv: record.iv, ciphertext: record.ciphertext,
    settings: connectionSettings(record.settings)};
}

function unlockRequired(record) {
  const message = record.version === 2 ? '使用通行密钥解锁这台设备。' : '输入同步口令以解锁这台设备。';
  return Object.assign(Error(message), {code: 'sync_unlock_required'});
}

export function createConnectionSync({storage, vault}) {
  let access;
  async function read() {
    if (!storage) return null;
    access ||= (storage.setAccessLevel?.({accessLevel: 'TRUSTED_CONTEXTS'}) ?? Promise.resolve())
      .catch(error => { access = null; throw error; });
    await access;
    const record = (await storage.get(slot))[slot];
    return record ? decodeRecord(record) : null;
  }

  async function info() {
    const record = await read();
    if (!record) return null;
    return {id: record.id, settings: record.settings, ...(record.passkey ? {passkey: record.passkey} : {})};
  }

  async function load({id, passphrase, passkeyKey} = {}) {
    const record = await read();
    if (!record || (id && record.id !== id)) throw Error('同步连接已变更。请确认当前连接后重试。');
    const scope = keyScope(record);
    const unlock = record.version === 2 ? passkeyKey : passphrase;
    let key;
    if (unlock) {
      key = record.version === 2 ? await fromPasskey(unlock, record.passkey) : await fromPassphrase(unlock, record.salt);
    } else {
      key = await vault.loadSyncKey(scope);
    }
    if (!key) throw unlockRequired(record);
    const apiKey = await decrypt(record, key);
    if (unlock) {
      if ((await read())?.id !== record.id) throw Error('同步连接已变更。请确认当前连接后重试。');
      await vault.saveSyncKey(scope, key);
    }
    return {id: record.id, settings: record.settings, apiKey};
  }

  async function save(settings, apiKey, passphrase, expectedId, {passkey, passkeyKey} = {}) {
    if (!storage) throw Error('当前 Chrome 不支持扩展同步。');
    if (!validKey(apiKey) || encoder.encode(apiKey).length > 512) throw Error('同步密钥格式有误。');
    settings = connectionSettings(settings);
    const previous = await read();
    if ((previous?.id || '') !== (expectedId || '')) throw Error('同步连接已变更。请确认当前连接后重试。');

    const newPasskey = passkey != null || passkeyKey != null;
    const record = {id: crypto.randomUUID(), iv: random(12), settings};
    if (newPasskey || previous?.version === 2) {
      record.version = 2;
      record.passkey = newPasskey ? normalizeSyncPasskey(passkey) : previous.passkey;
    } else {
      record.version = 1;
      record.salt = previous?.salt ?? random(16);
    }

    const scope = keyScope(record);
    const previousScope = previous && keyScope(previous);
    let key = await vault.loadSyncKey(scope);
    if (newPasskey) {
      key = await fromPasskey(passkeyKey, record.passkey);
    } else if (!key && record.version === 1) {
      if (typeof passphrase !== 'string' || passphrase.length < 16 || passphrase.length > 256) {
        throw Error('同步口令需为 16–256 个字符。');
      }
      key = await fromPassphrase(passphrase, record.salt);
    }
    if (!key) throw unlockRequired(record);
    if (previousScope === scope && await decrypt(previous, key) === apiKey &&
        JSON.stringify(fields(previous.settings)) === JSON.stringify(fields(settings))) return previous.id;

    const encrypted = await crypto.subtle.encrypt(
      {name: 'AES-GCM', iv: decode(record.iv), additionalData: additionalData(record)}, key, encoder.encode(apiKey),
    );
    record.ciphertext = encode(encrypted);
    await vault.saveSyncKey(scope, key);
    try {
      if ((await read())?.id !== previous?.id) throw Error('同步连接已变化，请重新打开模型连接。');
      await storage.set({[slot]: record});
    } catch (error) {
      // 迁移或轮换保存失败时，仍可解锁此前已同步的记录。
      if (previousScope !== scope) await Promise.resolve(vault.removeSyncKey(scope)).catch(() => {});
      throw error;
    }
    if (previousScope && previousScope !== scope) await Promise.resolve(vault.removeSyncKey(previousScope)).catch(() => {});
    return record.id;
  }

  async function remove(expectedId) {
    const record = await read();
    if (!record) return;
    if (record.id !== expectedId) throw Error('同步连接已变更。请确认当前连接后重试。');
    await storage.remove(slot);
    await vault.removeSyncKey(keyScope(record));
  }

  return {info, load, save, remove};
}

export const connectionSyncSlot = slot;
