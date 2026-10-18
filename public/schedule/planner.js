(function(root){
 'use strict';
 const subjects=['基礎科目','適性科目','専門科目(建設部門)'];
 const defaults={start:'2026-10-19',finish:'2026-11-19',prediction:'2026-11-20',final:'2026-11-21',exam:'2026-11-22',target:70,weekdayNew:25,holidayNew:36,weekdayReview:10,holidayReview:15,overrides:{}};
 const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const date=s=>new Date(s+'T12:00:00');
 function add(s,n){const d=date(s);d.setDate(d.getDate()+n);return day(d);}
 function days(a,b){const out=[];for(let d=a;d<=b&&out.length<730;d=add(d,1))out.push(d);return out;}
 function validDay(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(date(s))&&day(date(s))===s;}
 function validate(c){
  if(!['start','finish','prediction','final','exam'].every(k=>validDay(c[k])))return '日付を正しく入力してください。';
  if(!(c.start<=c.finish&&c.finish<c.prediction&&c.prediction<=c.final&&c.final<c.exam))return '開始日 → 過去問完了日 → 予想問題日 → 最終確認日 → 試験日の順で指定してください。';
  if((date(c.exam)-date(c.start))/86400000>365)return '計画期間は1年以内にしてください。';
  const limits={target:[1,100],weekdayNew:[1,100],holidayNew:[1,150],weekdayReview:[0,50],holidayReview:[0,70]};
  for(const [k,[min,max]]of Object.entries(limits))if(!Number.isFinite(c[k])||!Number.isInteger(c[k])||c[k]<min||c[k]>max)return '問題数・目標値を入力範囲内で設定してください。';
  return '';
 }
 function dayType(d,c){return c.overrides[d]||([0,6].includes(date(d).getDay())?'holiday':'weekday');}
 function capacity(d,c){
  const type=dayType(d,c);if(type==='rest')return {type,newCount:0,reviewCount:0};
  const holiday=type==='holiday';
  return {type,newCount:holiday?c.holidayNew:c.weekdayNew,reviewCount:holiday?c.holidayReview:c.weekdayReview};
 }
 function normalize(raw,questions){
  const source=raw?.history??raw;if(!source||typeof source!=='object'||Array.isArray(source))throw Error('学習履歴のオブジェクトが見つかりません。');
  const out={};for(const q of questions){const h=source[q.id];if(!h||!Number.isFinite(h.n)||h.n<=0)continue;
   const n=Math.floor(h.n),ok=Math.min(n,Math.max(0,Math.floor(Number(h.ok)||0)));
   out[q.id]={n,ok,lastOk:typeof h.lastOk==='boolean'?h.lastOk:null,attempts:(Array.isArray(h.attempts)?h.attempts:[]).filter(e=>Number.isFinite(e.at)&&typeof e.ok==='boolean').map(e=>({at:e.at,ok:e.ok})),review:h.review&&validDay(h.review.due)?{due:h.review.due}:null};
  }return out;
 }
 function stats(questions,history){
  return subjects.map(subject=>{const qs=questions.filter(q=>q.subject===subject&&q.answer!=null),done=qs.filter(q=>history[q.id]?.n>0),scored=done.filter(q=>typeof history[q.id].lastOk==='boolean'),correct=scored.filter(q=>history[q.id].lastOk).length;
   return {subject,total:qs.length,done:done.length,left:qs.length-done.length,correct,scored:scored.length,rate:scored.length?correct/scored.length:null};});
 }
 function plan(questions,history,c,today,todayDone=0){
  const remaining=stats(questions,history).reduce((n,s)=>n+s.left,0);
  const rows=days(today>c.start?today:c.start,c.finish).map(d=>({day:d,...capacity(d,c),count:0}));
  // Already completed new questions reduce today's remaining quota, not future quotas.
  for(const r of rows)if(r.day===today)r.newCount=Math.max(0,r.newCount-Math.max(0,todayDone));
  const totalCapacity=rows.reduce((n,r)=>n+r.newCount,0);
  let left=remaining;
  for(const r of rows){r.count=Math.min(left,r.newCount);left-=r.count;}
  const activeDays=rows.filter(r=>r.newCount>0).length;
  return {rows,remaining,totalCapacity,shortfall:Math.max(0,remaining-totalCapacity),spare:Math.max(0,totalCapacity-remaining),neededPerDay:activeDays?Math.ceil(remaining/activeDays):null};
 }
 function allocate(count,rows,target){
  const out=new Map(rows.map(s=>[s.subject,0]));
  for(let i=0;i<count;i++){
   const available=rows.filter(s=>out.get(s.subject)<s.left);
   if(!available.length)break;
   available.sort((a,b)=>{const weight=s=>s.left*(1+Math.max(0,target/100-(s.rate??0))*2)/(out.get(s.subject)+1);return weight(b)-weight(a)||subjects.indexOf(a.subject)-subjects.indexOf(b.subject);});
   const s=available[0];out.set(s.subject,out.get(s.subject)+1);
  }return out;
 }
 function review(questions,history,d){
  return questions.filter(q=>{const h=history[q.id];return q.answer!=null&&h?.n>0&&(h.review?h.review.due<=d:h.lastOk===false);})
   .sort((a,b)=>(history[a.id].review?.due||d).localeCompare(history[b.id].review?.due||d)||(history[a.id].ok/history[a.id].n)-(history[b.id].ok/history[b.id].n)||a.id.localeCompare(b.id));
 }
 function createGoal(questions,history,c,today,at=Date.now()){
  const p=plan(questions,history,c,today);
  return {createdAt:at,start:p.rows[0]?.day||today,finish:c.finish,baseline:Object.fromEntries(questions.filter(q=>history[q.id]?.n>0).map(q=>[q.id,history[q.id].n])),rows:p.rows.map(r=>({day:r.day,count:r.count,reviewCount:r.reviewCount})),remaining:p.remaining,shortfall:p.shortfall};
 }
 function goalProgress(questions,history,goal,from,to){
  const rows=goal.rows.filter(r=>r.day>=from&&r.day<=to);
  let actual=0,overall=0,undated=0;const reviewed=new Set();
  for(const q of questions){
   const h=history[q.id];if(!h?.n)continue;
   const baseline=goal.baseline[q.id]||0,isNew=!baseline;
   const events=(h.attempts||[]).slice().sort((a,b)=>a.at-b.at);
   // Only a complete timeline identifies the first-ever attempt reliably.
   const first=events.length===h.n?events[0]:null;
   if(isNew){overall++;if(!first||first.at<goal.createdAt)undated++;else{const d=day(new Date(first.at));if(d>=from&&d<=to)actual++;}}
   for(const e of events){if(e===first)continue;const d=day(new Date(e.at));if(d>=from&&d<=to)reviewed.add(d+':'+q.id);}
  }
  const target=rows.reduce((n,r)=>n+r.count,0),reviewTarget=rows.reduce((n,r)=>n+r.reviewCount,0);
  return {target,actual,gap:actual-target,overall,undated,reviews:reviewed.size,reviewTarget,rate:target?actual/target:null};
 }
 function suggestThemes(questions,history,topics,count){
  if(count<=0)return [];
  const groups=topics.map((topic,index)=>{
   const all=questions.filter(q=>q.topicId===topic.id&&q.answer!=null),pending=all.filter(q=>!history[q.id]?.n);
   const done=all.filter(q=>history[q.id]?.n);
   return {topic,index,questions:pending,untouched:done.length===0};
  }).filter(g=>g.questions.length);
  // Primary themes only, so no question is proposed twice via related themes.
  const rates=stats(questions,history);
  groups.sort((a,b)=>Number(b.untouched)-Number(a.untouched)||
   (rates.find(s=>s.subject===a.questions[0].subject)?.rate??0)-(rates.find(s=>s.subject===b.questions[0].subject)?.rate??0)||a.index-b.index);
  const result=[];let n=0;
  for(const group of groups){
   if(n>=count)break;
   if(n&&Math.abs(n-count)<=Math.abs(n+group.questions.length-count))break;
   const left=count-n;
   // Very large themes continue in the next session, never mix random topics.
   const questions=group.questions.length>Math.max(10,left*1.5)?group.questions.slice(0,left):group.questions;
   result.push({...group,questions,totalPending:group.questions.length});n+=questions.length;
  }
  return result;
 }
 function activity(questions,history,from,to){
  const fresh=new Set(),repeated=new Set(),reviewDays=new Set();let undated=0;
  for(const q of questions){
   const h=history[q.id];if(!h?.n)continue;
   const events=(h.attempts||[]).filter(e=>Number.isFinite(e.at)&&typeof e.ok==='boolean').slice().sort((a,b)=>a.at-b.at);
   const first=events.length===h.n?events[0]:null;
   if(!first)undated++;
   for(const e of events){const d=day(new Date(e.at));if(d<from||d>to)continue;
    if(e===first)fresh.add(q.id);else{repeated.add(q.id);reviewDays.add(d+':'+q.id);}
   }
  }
  return {fresh:fresh.size,reviews:reviewDays.size,reviewIds:[...repeated],undated};
 }
 function targets(c,from,to){
  const rows=days(from,to).filter(d=>d>=c.start&&d<=c.finish).map(d=>({day:d,...capacity(d,c)}));
  return {fresh:rows.reduce((n,r)=>n+r.newCount,0),reviews:rows.reduce((n,r)=>n+r.reviewCount,0),rows};
 }
 const api={subjects,defaults,day,date,add,days,validDay,validate,dayType,capacity,normalize,stats,plan,allocate,review,createGoal,goalProgress,suggestThemes,activity,targets};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Planner=api;
})(typeof globalThis!=='undefined'?globalThis:this);
