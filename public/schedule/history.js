window.ScheduleHistory=function(questions){const QUESTION_BY_ID=new Map(questions.map(q=>[q.id,q]));function isNoAnswer(q){return q.answer===null||q.answer===undefined;}
function studyDayKey(at=Date.now()){
  const d=new Date(at),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function validStudyDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d=new Date(value+'T12:00:00');
  return Number.isFinite(d.getTime())&&studyDayKey(d.getTime())===value;
}
function studyDayAfter(day,days){
  const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+days);return studyDayKey(d.getTime());
}
function reviewInterval(stage){return [1,3,7,14,30][Math.min(4,Math.max(0,stage))];}
function studyReviewSchedule(q,h,today=studyDayKey()){
  if(!q||q.kind==='prediction'||isNoAnswer(q)||!h||!(h.n>h.ok)) return null;
  if(h.review&&Number.isInteger(h.review.stage)&&h.review.stage>=0&&h.review.stage<=4&&validStudyDay(h.review.due)) return h.review;
  // Old totals have no attempt timeline: derive a first schedule from the last known result.
  const stage=h.lastOk===true?1:0;
  return {stage,due:h.at>0?studyDayAfter(studyDayKey(h.at),reviewInterval(stage)):today};
}

function mistakeLabels(){return ['知識不足','公式の選び間違い','計算・単位ミス','読み違い'];}
function normalizeStudyRecord(id,raw){
  const h=raw&&typeof raw==='object'?raw:{};
  const n=Number.isFinite(h.n)?Math.max(0,Math.floor(h.n)):0;
  const ok=Number.isFinite(h.ok)?Math.max(0,Math.min(n,Math.floor(h.ok))):0;
  const q=QUESTION_BY_ID.get(id),seen=new Set();
  const attempts=(Array.isArray(h.attempts)?h.attempts:[]).filter(a=>{
    if(!a||typeof a!=='object'||typeof a.id!=='string'||!a.id||seen.has(a.id)||
      !Number.isFinite(a.at)||a.at<=0||!['study','practice','exam'].includes(a.mode)||
      !(typeof a.ok==='boolean'||(a.ok===null&&a.scored===false))||
      !(a.answer===null||(Number.isInteger(a.answer)&&a.answer>=0&&a.answer<=(q?.choices.length||10)))) return false;
    seen.add(a.id);return true;
  }).map(a=>({id:a.id,at:a.at,mode:a.mode,answer:a.answer,ok:a.ok,scored:a.scored!==false,
      mistakeReason:a.ok===false&&a.scored!==false&&mistakeLabels().includes(a.mistakeReason)?a.mistakeReason:null,
      reasonAt:Number.isFinite(a.reasonAt)?Math.max(0,a.reasonAt):0}))
    .sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const normalized={...h,n,ok,lastOk:typeof h.lastOk==='boolean'?h.lastOk:null,at:Number.isFinite(h.at)?Math.max(0,h.at):0,attempts};
  normalized.review=studyReviewSchedule(q,normalized);return normalized;
}
function mergeStudyRecord(id,current,incoming){
  const a=normalizeStudyRecord(id,current),b=normalizeStudyRecord(id,incoming);
  const winner=!current||b.at>=a.at?b:a;
  const events=new Map(a.attempts.map(e=>[e.id,e]));
  b.attempts.forEach(e=>{const prev=events.get(e.id);if(!prev||(e.reasonAt||0)>(prev.reasonAt||0))events.set(e.id,e);});
  const merged=normalizeStudyRecord(id,{...winner,attempts:[...events.values()]});
  // With timelines on both sides, count their event union once. The old,
  // unlogged baseline cannot be deduplicated by date; preserve the larger one.
  if(a.attempts.length&&b.attempts.length){
    const correct=events=>events.filter(e=>e.ok===true||e.scored===false).length;
    const baseline=a.n-a.attempts.length>=b.n-b.attempts.length?a:b;
    merged.n=Math.max(0,baseline.n-baseline.attempts.length)+merged.attempts.length;
    merged.ok=Math.max(0,baseline.ok-correct(baseline.attempts))+correct(merged.attempts);
    merged.ok=Math.min(merged.n,merged.ok);
    merged.review=studyReviewSchedule(QUESTION_BY_ID.get(id),merged);
  }
  return merged;
}

return {normalize:normalizeStudyRecord,merge:mergeStudyRecord};};