/* Account-local storage and convergent, per-field sync snapshots. No credentials. */
(function(root){
  'use strict';
  const KEYS={history:'gijutsushi_r7_history_v1',unsure:'gijutsushi_unsure_v1',learned:'gijutsushi_book_learned_v1',memos:'gijutsushi_memo_v1'};
  const LOCAL=[...Object.values(KEYS),'gijutsushi_session_v1','gijutsushi_setup_v1','gijutsushi_memo_ui_v1'];
  const ACTIVE='gijutsushi_drive_active_v1';
  const cleanId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,180}$/.test(s);
  const dict=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const safeKeys=x=>Object.keys(dict(x)).filter(k=>!['__proto__','constructor','prototype'].includes(k));
  const json=x=>JSON.stringify(x);
  function compare(a,b){return (a?.at||0)-(b?.at||0)||String(a?.actor||'').localeCompare(String(b?.actor||''));}
  function empty(owner){return {app:'gijutsushi-drive',schema:1,owner,fields:{history:{},unsure:{},learned:{},memos:{},schedule:{}}};}
  function validate(doc,owner){
    if(doc?.app!=='gijutsushi-drive'||doc.schema!==1||doc.owner!==owner||!cleanId(owner))throw Error('アカウントまたは保存形式が一致しません。');
    for(const group of Object.keys(empty(owner).fields)){
      if(group==='schedule'&&!doc.fields?.schedule)continue;
      if(!doc.fields||!doc.fields[group]||Array.isArray(doc.fields[group])||typeof doc.fields[group]!=='object')throw Error('保存データの形式が不正です。');
      for(const key of safeKeys(doc.fields[group])){
        const r=doc.fields[group][key];
        if(!r||!Number.isSafeInteger(r.at)||r.at<0||!cleanId(r.actor)||!Object.hasOwn(r,'value'))throw Error('保存データの更新情報が不正です。');
        if(['unsure','learned'].includes(group)&&typeof r.value!=='boolean')throw Error('チェックの形式が不正です。');
        if(['history','memos','schedule'].includes(group)&&r.value!==null&&(typeof r.value!=='object'||Array.isArray(r.value)))throw Error('学習記録の形式が不正です。');
      }
    }
    return doc;
  }
  function materialize(doc){
    const out={history:{},unsure:[],learned:[],memos:{}};
    for(const group of Object.keys(out))for(const key of safeKeys(doc.fields[group])){
      const value=doc.fields[group][key].value;
      if(['unsure','learned'].includes(group)){if(value)out[group].push(key);}
      else if(value!==null)out[group][key]=value;
    }
    return out;
  }
  function capture(previous,current,actor,now=Date.now()){
    const doc=JSON.parse(json(previous));doc.fields.schedule=doc.fields.schedule||{};let clock=now;
    for(const group of Object.keys(doc.fields))for(const r of Object.values(doc.fields[group]||{}))clock=Math.max(clock,r.at+1);
    for(const group of Object.keys(doc.fields)){
      if(group==='schedule'){if(current.schedule?.plan&&(!doc.fields.schedule.plan||compare(current.schedule.plan,doc.fields.schedule.plan)>0))doc.fields.schedule.plan=current.schedule.plan;continue;}
      const values=['unsure','learned'].includes(group)?Object.fromEntries((current[group]||[]).map(k=>[k,true])):dict(current[group]);
      for(const key of new Set([...safeKeys(values),...safeKeys(doc.fields[group])])){
        const value=Object.hasOwn(values,key)?values[key]:['unsure','learned'].includes(group)?false:null;
        const old=doc.fields[group][key];
        if(!old||json(old.value)!==json(value))doc.fields[group][key]={value,at:clock++,actor};
      }
    }
    return doc;
  }
  function merge(documents,owner,mergeHistory){
    const out=empty(owner);documents.forEach(d=>validate(d,owner));
    for(const group of Object.keys(out.fields)){
      const keys=new Set(documents.flatMap(d=>safeKeys(d.fields[group])));
      for(const key of keys){
        const records=documents.map(d=>d.fields[group]?.[key]).filter(Boolean).sort(compare);
        const winner=records.at(-1);let value=winner.value;
        if(group==='history'&&value!==null){
          // A deletion cuts off older answers; later independent attempts are unioned.
          const tomb=records.filter(r=>r.value===null).at(-1);
          value=undefined;
          for(const r of records)if(r.value!==null&&(!tomb||compare(r,tomb)>0))value=mergeHistory(key,value,r.value);
        }
        out.fields[group][key]={...winner,value};
      }
    }
    return out;
  }
  function storage(raw,onChange=()=>{}){
    const owner=raw.getItem(ACTIVE)||'';
    if(owner&&!cleanId(owner))throw Error('アカウント情報が不正です。');
    const key=k=>owner&&LOCAL.includes(k)?'gijutsushi_account_'+owner+':'+k:k;
    const guard=()=>{if((raw.getItem(ACTIVE)||'')!==owner)throw Error('別タブでアカウントが変わりました。再読み込みしてください。');};
    return {owner,getItem:k=>raw.getItem(key(k)),setItem(k,v){guard();raw.setItem(key(k),v);if(Object.values(KEYS).includes(k))onChange();},removeItem(k){guard();raw.removeItem(key(k));if(Object.values(KEYS).includes(k))onChange();},
      switchTo(next){if(next&&!cleanId(next))throw Error('アカウント情報が不正です。');raw.setItem(ACTIVE,next);},key};
  }
  const api={KEYS,LOCAL,ACTIVE,cleanId,empty,compare,validate,capture,materialize,merge,storage};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.DriveStudyCore=api;
})(typeof window!=='undefined'?window:globalThis);
