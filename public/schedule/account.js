/* Shared account plan snapshot. Defaults never overwrite another device's plan. */
(function(root){
 'use strict';
 const key=owner=>'gijutsushi_schedule_v2:'+(owner||'local');
 function valid(value){
  if(!value||typeof value!=='object'||!value.config||typeof value.config!=='object')return false;
  const c=value.config;
  if(!['start','finish','prediction','final','exam'].every(k=>typeof c[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c[k])))return false;
  if(!(c.start<=c.finish&&c.finish<c.prediction&&c.prediction<=c.final&&c.final<c.exam))return false;
  for(const k of ['target','weekdayNew','holidayNew','weekdayReview','holidayReview'])if(!Number.isInteger(c[k])||c[k]<0||c[k]>150)return false;
  if(!c.weekdayNew||c.weekdayNew>100||!c.holidayNew||!c.target||c.target>100||c.weekdayReview>50||c.holidayReview>70)return false;
  const g=value.goal;
  return !g||(Number.isFinite(g.createdAt)&&g.baseline&&typeof g.baseline==='object'&&Array.isArray(g.rows)&&g.rows.every(r=>typeof r.day==='string'&&Number.isFinite(r.count)&&r.count>=0&&Number.isFinite(r.reviewCount)&&r.reviewCount>=0)&&Number.isFinite(g.remaining)&&g.remaining>=0);
 }
 function capture(raw,owner){
  try{const s=JSON.parse(raw.getItem(key(owner))||'null');if(s?.source!=='app'||!valid(s)||!Number.isSafeInteger(s._syncAt)||s._syncAt<=0||typeof s._syncActor!=='string')return {};
   return {plan:{at:s._syncAt,actor:s._syncActor,value:{config:s.config,goal:s.goal||null,checks:s.checks||{},notes:s.notes||{}}}};
  }catch(e){return {};}
 }
 function apply(raw,owner,record){
  if(!record||!valid(record.value))return false;
  const existing=capture(raw,owner).plan;
  if(existing&&(existing.at>record.at||(existing.at===record.at&&existing.actor>=record.actor)))return false;
  let previous={};try{previous=JSON.parse(raw.getItem(key(owner))||'{}')||{};}catch(e){}
  raw.setItem(key(owner),JSON.stringify({...previous,...record.value,source:'app',_syncAt:record.at,_syncActor:record.actor}));return true;
 }
 const api={key,valid,capture,apply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScheduleSync=api;
})(typeof window!=='undefined'?window:globalThis);
