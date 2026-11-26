import test from 'node:test';
import assert from 'node:assert/strict';
import {createLinkGroups} from '../extension/core/link-groups.mjs';

function fixture() {
  const tabs = new Map(), groups = new Map();
  const storage = () => {
    const data = {};
    return {async get(key) { return {[key]:structuredClone(data[key])}; }, async set(next) {Object.assign(data,structuredClone(next));}};
  };
  const get = (map,id) => {
    if (!map.has(id)) throw Error('absent');
    return {...map.get(id)};
  };
  let number = 20;
  const chrome = {
    storage:{local:storage(),session:storage()},
    windows:{async get(id) {return {id,type:'normal'};}},
    tabs:{
      async get(id) {return get(tabs,id);},
      async query({groupId,windowId}) {return [...tabs.values()].filter(tab=>tab.groupId===groupId&&tab.windowId===windowId);},
      async group({groupId=++number,tabIds}) {
        if (!groups.has(groupId)) groups.set(groupId,{id:groupId,windowId:1,collapsed:false});
        for (const id of tabIds) tabs.get(id).groupId=groupId;
        return groupId;
      },
      async ungroup(ids) {for (const id of ids) tabs.get(id).groupId=-1;},
    },
    tabGroups:{
      async get(id) {return get(groups,id);},
      async update(id,delta) {return Object.assign(groups.get(id),delta);},
    }
  };
  function add(id, overrides={}) {
    const tab={id,windowId:1,groupId:-1,active:false,url:'https://example.test/'+id,title:'研究笔记 | 示例网站',...overrides};
    tabs.set(id,tab);
    return tab;
  }
  return {controller:createLinkGroups(chrome),tabs,groups,add};
}

test('空白窗口载入链接后自动分组，后续链接跟随，最后留下来源时收起空分组',async()=>{
 const {controller,tabs,groups,add}=fixture();
 const root=add(1,{active:true}), one=add(2,{openerTabId:1,url:'about:blank'});
 await controller.created(one);
 assert.equal(root.groupId,-1);
 one.url='https://docs.test/topic';
 await controller.groupLink(one.id);
 assert.equal(root.groupId,one.groupId);
 assert.equal(groups.get(root.groupId).title,'研究笔记');
 const two=add(3,{openerTabId:1});
 await controller.created(two);
 assert.equal(root.groupId,two.groupId);
 tabs.delete(2);
 await controller.membershipChanged(1);
 assert.notEqual(root.groupId,-1);
 tabs.delete(3);
 await controller.membershipChanged(1);
 assert.equal(root.groupId,-1);
});

test('独立、固定、前台弹窗及跨窗口标签保持原位，可以关闭自动分组',async()=>{
 const {controller,add}=fixture();
 add(1,{pinned:true});
 add(2,{active:true});
 for(const newTab of [add(3,{openerTabId:1}),add(4,{active:true,openerTabId:2}),add(5),add(6,{windowId:5,openerTabId:2})]) {
   await controller.created(newTab);
   assert.equal(newTab.groupId,-1);
 }
 await controller.configure(false);
 const disabled=add(7,{openerTabId:2});
 await controller.created(disabled);
 assert.equal(disabled.groupId,-1);
});

test('手动改过名称的分组独立保留，闲置组不会收纳新打开的链接',async()=>{
 const {controller,add,groups,tabs}=fixture();
 const root=add(1,{active:true}), nested=add(2,{openerTabId:1});
 await controller.created(nested);
 const id=root.groupId;
 groups.get(id).title='手动命名';
 await controller.prune(id);
 tabs.delete(nested.id);
 await controller.membershipChanged(1);
 assert.equal(root.groupId,id);
 groups.get(id).title='闲置标签';
 const child=add(3,{openerTabId:1});
 await controller.created(child);
 assert.equal(child.groupId,-1);
});
