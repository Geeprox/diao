const rp = {name: 'Tab Cadence'};
const publicKeyParameters = [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}];
const requestTimeout = 60000;

const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

function decode(value, maxBytes) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) ||
      !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw Error('通行密钥的同步记录有误。');
  }
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), letter => letter.charCodeAt(0));
    if (encode(bytes) === value) return bytes;
  } catch {
    // 拒绝不规范的 base64url 编码。
  }
  throw Error('通行密钥的同步记录有误。');
}

export function normalizeSyncPasskey(passkey) {
  const {credentialId, salt} = passkey ?? {};
  decode(credentialId, 1024);
  if (decode(salt, 32).byteLength !== 32) throw Error('通行密钥的同步记录有误。');
  return {credentialId, salt};
}

export function syncPasskeyKeyBytes(value) {
  const material = decode(value, 32);
  if (material.byteLength !== 32) throw Error('无法读取通行密钥的解锁结果。');
  return material;
}

function credentialOptions(credentials) {
  if (typeof credentials?.create !== 'function' || typeof credentials.get !== 'function') {
    throw Error('此 Chrome 无法使用支持同步的通行密钥。');
  }
  return credentials;
}

async function verify(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
      throw Error('未完成通行密钥验证，可重新验证。');
    }
    throw error;
  }
}

function credentialIdOf(credential, isNew = false) {
  if (credential?.type !== 'public-key' || !credential.rawId?.byteLength) {
    throw Error('未取得通行密钥。');
  }
  const authenticatorData = isNew ? credential.response.getAuthenticatorData?.() : credential.response.authenticatorData;
  const flags = new Uint8Array(authenticatorData)[32] ?? 0;
  // UV 确认设备验证。BE 确认它是可以在多台设备上使用的通行密钥。
  if (!(flags & 0x04)) throw Error('请完成设备身份验证。');
  if (!(flags & 0x08)) throw Error('请选择可在设备间同步的通行密钥，例如 Google 密码管理工具。');
  return encode(credential.rawId);
}

function prfKey(credential) {
  const result = credential.getClientExtensionResults?.()?.prf?.results?.first;
  return result?.byteLength === 32 ? encode(result) : null;
}

export async function recoverSyncPasskey(passkey, credentials = globalThis.navigator?.credentials) {
  credentials = credentialOptions(credentials);
  const {credentialId, salt} = normalizeSyncPasskey(passkey);
  const credential = await verify(() => credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{type: 'public-key', id: decode(credentialId, 1024)}],
      timeout: requestTimeout,
      userVerification: 'required',
      extensions: {prf: {eval: {first: decode(salt, 32)}}},
    },
  }));
  if (credentialIdOf(credential) !== credentialId) throw Error('通行密钥与保存的连接不匹配。');
  const passkeyKey = prfKey(credential);
  if (!passkeyKey) throw Error('这枚通行密钥无法解锁连接。请选择创建同步时使用的通行密钥。');
  return passkeyKey;
}

export async function createSyncPasskey(credentials = globalThis.navigator?.credentials) {
  credentials = credentialOptions(credentials);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  // Chrome 扩展使用自身的 RP ID。省略 rp.id 可保留 Chrome 对扩展源的绑定。
  const credential = await verify(() => credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp,
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: 'tab-cadence-model-connection',
        displayName: 'Tab Cadence 模型连接',
      },
      pubKeyCredParams: publicKeyParameters,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      attestation: 'none',
      timeout: requestTimeout,
      extensions: {prf: {eval: {first: salt}}},
    },
  }));
  const passkey = normalizeSyncPasskey({credentialId: credentialIdOf(credential, true), salt: encode(salt)});
  if (credential.getClientExtensionResults?.()?.prf?.enabled !== true) {
    throw Error('此通行密钥不支持加密同步。请在 Google 密码管理工具中创建一枚。');
  }
  const passkeyKey = prfKey(credential) ?? await recoverSyncPasskey(passkey, credentials);
  return {passkey, passkeyKey};
}
