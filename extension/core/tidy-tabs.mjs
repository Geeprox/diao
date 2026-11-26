import {fingerprint,safeURL} from './policy.mjs';

export const tidyAlarm = 'tidy-tabs';
const preference = 'tabTidyHours';
const savedGroups = 'tabTidyGroups';
const currentSession = 'tabTidySession';
const title = '闲置标签';
const color = 'grey';
const hours = [0,12,24,72,168];
const needsAttention = new Set(['waiting','resume','closing','paused']);

function eligible(tab, record, touched, cutoff) {
  const lastUsed = Math.max(tab.lastAccessed || 0,touched[tab.id] || 0);
  return Number.isInteger(tab.id) && tab.id >= 0 && !tab.incognito && !tab.active && !tab.highlighted &&
    !tab.pinned && !tab.audible && (tab.groupId ?? -1) < 0 && tab.status !== 'loading' && !tab.pendingUrl &&
    safeURL(tab.url) && lastUsed > 0 && lastUsed <= cutoff &&
    !(record?.url === tab.url && (record.watching || needsAttention.has(record.state)));
}

async function groupContents(tabs) {
  // 浏览器重启可能更换分组 ID。用同名同色分组的成员指纹确认归属，链接本身不持久化。
  return fingerprint(tabs.map(tab=>tab.url || '').sort());
}

export function createTidyTabs(chrome, loadRecords, changed) {
  const {local,session} = chrome.storage;
  const setting = async () => {
    const value = (await local.get(preference))[preference];
    return hours.includes(value) ? value : 0;
  };

  async function schedule() {
    if (!await setting()) { await chrome.alarms.clear(tidyAlarm); return; }
    const alarm = await chrome.alarms.get(tidyAlarm);
    if (!alarm) await chrome.alarms.create(tidyAlarm,{periodInMinutes:15});
  }

  async function configure(value) {
    if (!hours.includes(value)) throw Error('请选择整理间隔。');
    await local.set({[preference]:value});
    await schedule();
    return value;
  }

  async function touch(tabId) {
    if (!await setting()) return;
    const state = (await session.get(currentSession))[currentSession] || {};
    await session.set({[currentSession]:{...state,touched:{...state.touched,[tabId]:Date.now()}}});
  }

  async function sweep() {
    const value = await setting();
    if (!value) return;
    const now = Date.now(), cutoff = now - value * 3600000;
    const [windows,records,stored,active] = await Promise.all([
      chrome.windows.getAll({windowTypes:['normal'],populate:true}),
      loadRecords(),local.get(savedGroups),session.get(currentSession),
    ]);
    const prior = active[currentSession];
    const touched = prior?.touched || {};
    const owned = [];
    const candidates = [];
    const normal = windows.filter(window=>!window.incognito);
    for (const window of normal) {
      const groups = await chrome.tabGroups.query({windowId:window.id,title,color});
      for (const group of groups) {
        const tabs = (window.tabs || []).filter(tab=>tab.groupId === group.id);
        if (tabs.length) candidates.push({...group,signature:await groupContents(tabs)});
      }
    }
    const proofs = stored[savedGroups] || [];
    for (const group of candidates) {
      // 在同一会话用原生 ID。重启后只接管唯一、完整匹配的旧分组。
      if (prior?.groups?.some(g=>g.id === group.id && g.windowId === group.windowId) ||
          !prior?.groups && proofs.filter(signature=>signature===group.signature).length===1 &&
            candidates.filter(candidate=>candidate.signature===group.signature).length===1) owned.push(group);
    }

    let moved = false;
    const seen = new Set();
    for (const window of normal) {
      const tabs = (window.tabs || []).filter(tab=>!tab.incognito);
      for (const tab of tabs) {
        seen.add(String(tab.id));
        // 兼容没有 lastAccessed 的 Chrome 和从未激活过的标签。
        if (!tab.lastAccessed && !touched[tab.id]) touched[tab.id] = now;
      }
      const group = owned.find(item=>item.windowId === window.id);
      if (group ? !group.collapsed : candidates.some(item=>item.windowId === window.id)) continue;
      if (!tabs.some(tab=>eligible(tab,records[tab.id],touched,cutoff))) continue;
      const fresh = await chrome.tabs.query({windowId:window.id});
      const ids = fresh.filter(tab=>eligible(tab,records[tab.id],touched,cutoff)).map(tab=>tab.id);
      if (ids.length < (group ? 1 : 2)) continue;

      if (group) {
        const current = await chrome.tabGroups.get(group.id).catch(()=>null);
        if (current?.collapsed && current.title===title && current.color===color && current.windowId===window.id) {
          try { await chrome.tabs.group({groupId:group.id,tabIds:ids}); moved = true; } catch {}
        }
      } else {
        let id;
        try {
          id = await chrome.tabs.group({tabIds:ids,createProperties:{windowId:window.id}});
          const members = await chrome.tabs.query({windowId:window.id,groupId:id});
          await chrome.tabGroups.update(id,{title,color,collapsed:members.length>0 && members.every(tab=>!tab.active&&!tab.highlighted)});
          owned.push({id,windowId:window.id});
          moved = true;
        } catch {
          if (Number.isInteger(id)) {
            const added = (await chrome.tabs.query({groupId:id}).catch(()=>[])).filter(tab=>ids.includes(tab.id));
            if (added.length) await chrome.tabs.ungroup(added.map(tab=>tab.id)).catch(()=>{});
          }
        }
      }
    }
    const groups = [];
    for (const {id,windowId} of owned) {
      const tabs = await chrome.tabs.query({windowId,groupId:id}).catch(()=>[]);
      if (tabs.length) groups.push({id,windowId,signature:await groupContents(tabs)});
    }
    const liveTouches = Object.fromEntries(Object.entries(touched).filter(([id,at])=>seen.has(id) && at > now - 168*3600000));
    // 无 Chrome 访问时间的活标签继续保留首次观察时刻，否则永远无法达到七天阈值。
    for (const window of normal) for (const tab of window.tabs || []) {
      if (!tab.lastAccessed && touched[tab.id]) liveTouches[tab.id] = touched[tab.id];
    }
    await session.set({[currentSession]:{groups,touched:liveTouches}});
    const signatures = groups.map(group=>group.signature);
    if (JSON.stringify(signatures)!==JSON.stringify(proofs)) await local.set({[savedGroups]:signatures});
    if (moved) changed();
  }

  return {setting,schedule,configure,touch,sweep};
}
