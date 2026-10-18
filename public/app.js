/* 技術士第一次試験 過去問アプリ（PWA版）
   このファイルは build_pwa.py が kakomon_app/build/template.html から生成する。
   直接編集せず、template.html か pwa/src/pwa.js を編集してビルドし直すこと。 */
/* eslint-disable */
const APPDATA = window.APPDATA;
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
  function empty(owner){return {app:'gijutsushi-drive',schema:1,owner,fields:{history:{},unsure:{},learned:{},memos:{}}};}
  function validate(doc,owner){
    if(doc?.app!=='gijutsushi-drive'||doc.schema!==1||doc.owner!==owner||!cleanId(owner))throw Error('アカウントまたは保存形式が一致しません。');
    for(const group of Object.keys(empty(owner).fields)){
      if(!doc.fields||!doc.fields[group]||Array.isArray(doc.fields[group])||typeof doc.fields[group]!=='object')throw Error('保存データの形式が不正です。');
      for(const key of safeKeys(doc.fields[group])){
        const r=doc.fields[group][key];
        if(!r||!Number.isSafeInteger(r.at)||r.at<0||!cleanId(r.actor)||!Object.hasOwn(r,'value'))throw Error('保存データの更新情報が不正です。');
        if(['unsure','learned'].includes(group)&&typeof r.value!=='boolean')throw Error('チェックの形式が不正です。');
        if(['history','memos'].includes(group)&&r.value!==null&&(typeof r.value!=='object'||Array.isArray(r.value)))throw Error('学習記録の形式が不正です。');
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
    const doc=JSON.parse(json(previous));let clock=now;
    for(const group of Object.keys(doc.fields))for(const r of Object.values(doc.fields[group]))clock=Math.max(clock,r.at+1);
    for(const group of Object.keys(doc.fields)){
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
        const records=documents.map(d=>d.fields[group][key]).filter(Boolean).sort(compare);
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

const DRIVE_CLIENT_ID = "966705122251-pjqqao4get3tfhubhu4vlums07fijah7.apps.googleusercontent.com";
{
const studyStorage = DriveStudyCore.storage(window.localStorage,()=>window.dispatchEvent(new Event('study-local-change')));
const localStorage = studyStorage;
/* ============================================================
   問題データ
   ・year / subject / group で絞り込み。年度を増やす場合は
     同じスキーマのオブジェクトを QUESTIONS に追加するだけ。
   ============================================================ */
const QUESTIONS  = APPDATA.questions;
/* 公式問題とは別ID・別ファイルの非公式予想問題。 */
const PREDICTIONS = APPDATA.predictions;

/* 図表画像（PDFから切り出したもの）。キーは問題ID */
const FIGURES    = APPDATA.figures;
/* 公式過去問の解説図（図・表・グラフ）。キーは問題ID、値は [{src, alt, caption}]。
   build/explanation_figs.py が data/explanation_figs から作り、build.py が埋め込む。 */
const EXPLAIN_FIGS = APPDATA.explainFigures || {};

/* 解説書（kiso_kaisetsu等）の該当テーマ索引。キーは "年度||問題番号"。
   build/build_kaisetsu_index.py が生成し、build.py が埋め込む。 */
const KAISETSU   = APPDATA.kaisetsu;

/* 科目ごとのジャンルの並び順（本試験の出題ブロック順）。模試モードで使う。 */
const GENRE_ORDER = APPDATA.genreOrder;

/* 本番1回分のジャンル別出題数。模試モードの問題数はこれで決まる。
   基礎科目は各群6問（計30問）、適性科目15問、専門科目35問で合計80問。 */
const EXAM_COMP  = APPDATA.examComp;
/* 教科書の目次・本文・公式問題との対応表。 */
const TEXTBOOK = APPDATA.textbook;

/* ジャンルがブロック順で何番目か。GENRE_ORDER に無い場合は末尾扱い。 */
function genreRank(q){
  if(typeof q.genreOrder === 'number') return q.genreOrder;
  const list = GENRE_ORDER[q.subject] || [];
  const i = list.findIndex(g => (q.genre||'').indexOf(g)===0);
  return i<0 ? 999 : i;
}

const CIRCLE = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
/* 「わからない（解説を見る）」を選んだときの解答値。どの選択肢とも一致しないので
   不正解として扱われ、間違えたときとまったく同じ動きになる。 */
const GIVEUP = 0;
const SUBJECT_ORDER = ['基礎科目','適性科目','専門科目(建設部門)'];
/* 合格基準：各科目とも満点の50%以上 */
const PASS_RATIO = 0.5;

const $ = id => document.getElementById(id);
const uniq = a => [...new Set(a)];
let homeView='study';
function syncWorkspace(){
  $('studyPane').classList.toggle('hide',homeView!=='study');
  $('recordsPane').classList.toggle('hide',homeView!=='records');
  const inBook=!$('textbook').classList.contains('hide');
  $('workspaceNav').classList.toggle('hide',!$('quiz').classList.contains('hide')||!$('result').classList.contains('hide'));
  [['btnHomeStudy',!inBook&&homeView==='study'],['btnTextbook',inBook],['btnHomeRecords',!inBook&&homeView==='records']].forEach(([id,active])=>{
    $(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('btn-primary',active);$(id).classList.toggle('btn-ghost',!active);
  });
}
function selectHomeView(view){homeView=view;toSetup();syncWorkspace();}
$('btnHomeStudy').addEventListener('click',()=>selectHomeView('study'));
$('btnHomeRecords').addEventListener('click',()=>selectHomeView('records'));
$('homeSubject').addEventListener('change',refreshSetup);
$('learningInsights').addEventListener('toggle',()=>{if($('learningInsights').open)renderLearningInsights();});
function syncChrome(){
  syncWorkspace();
  const setupVisible=!$('setup').classList.contains('hide');
  const quizVisible=!$('quiz').classList.contains('hide');
  $('btnMemo').classList.toggle('hide',!quizVisible);
  const calcAvailable=quizVisible||!$('textbook').classList.contains('hide');
  $('btnCalc').classList.toggle('hide',!calcAvailable);
  if(!calcAvailable) calculatorOpen(false,false);
  $('btnHome').classList.toggle('hide',setupVisible);
  $('bookQuizReturn').classList.toggle('hide',!quizVisible || !S?.textbookTopicId);
  $('bookResultReturn').classList.toggle('hide',$('result').classList.contains('hide') || !S?.textbookTopicId);
  $('bookStudyReturn').classList.toggle('hide',$('textbook').classList.contains('hide') || !S?.bookVisit);
}

/* ---------- 試験で認められる機能範囲の簡易電卓（式・履歴は保存しない） ---------- */
function calculatorState(memory=0){
  return {display:'0',acc:null,op:null,awaiting:false,replace:true,lastOp:null,lastValue:null,memory,error:''};
}
let calculator=calculatorState();
const calcSymbol={'+' : '＋','-' : '−','*' : '×','/' : '÷'};
function calculatorRound(value){
  if(!Number.isFinite(value)) throw new Error('計算できる範囲を超えました');
  return Object.is(value,-0)?0:Number(value.toPrecision(12));
}
function calculatorCompute(a,b,op){
  if(op==='/'&&b===0) throw new Error('ゼロでは割れません');
  return calculatorRound(op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:a/b);
}
function calculatorPut(value){
  calculator.display=String(calculatorRound(value)); calculator.error='';
}
function calculatorPress(key){
  if(key==='ac'){ calculator=calculatorState(calculator.memory); return; }
  if(key==='mc'){ calculator.memory=0; return; }
  if(key==='ce'){
    if(calculator.error) calculator=calculatorState(calculator.memory);
    calculator.display='0'; calculator.awaiting=false; calculator.replace=true;
    calculator.lastOp=null; calculator.lastValue=null; return;
  }
  if(/^[0-9.]$/.test(key)){
    if(calculator.error) calculator=calculatorState(calculator.memory);
    if(calculator.replace){
      calculator.display='0'; calculator.replace=false;
      if(!calculator.op){calculator.acc=null;calculator.lastOp=null;calculator.lastValue=null;}
    }
    calculator.awaiting=false;
    if(key==='.'){
      if(!calculator.display.includes('.')&&!calculator.display.includes('e')) calculator.display+='.';
    }else{
      const digits=calculator.display.replace(/[^0-9]/g,'').replace(/^0+/,'');
      if(digits.length>=12) return;
      if(calculator.display==='0') calculator.display=key;
      else if(calculator.display==='-0') calculator.display='-'+key;
      else calculator.display+=key;
    }
    return;
  }
  if(calculator.error) return;
  if(key==='back'){
    if(!calculator.replace){
      calculator.display=calculator.display.slice(0,-1);
      if(!calculator.display||calculator.display==='-') calculator.display='0';
    }
    return;
  }
  const value=Number(calculator.display);
  try{
    if(['+','-','*','/'].includes(key)){
      if(calculator.op&&!calculator.awaiting) calculatorPut(calculatorCompute(calculator.acc,value,calculator.op));
      calculator.acc=Number(calculator.display); calculator.op=key;
      calculator.awaiting=true; calculator.replace=true; calculator.lastOp=null; calculator.lastValue=null;
    }else if(key==='='){
      if(calculator.op){
        const operand=calculator.awaiting?calculator.acc:value;
        calculatorPut(calculatorCompute(calculator.acc,operand,calculator.op));
        calculator.lastOp=calculator.op; calculator.lastValue=operand;
        calculator.op=null; calculator.acc=null;
      }else if(calculator.lastOp) calculatorPut(calculatorCompute(value,calculator.lastValue,calculator.lastOp));
      calculator.replace=true; calculator.awaiting=false;
    }else if(key==='sqrt'||key==='%'){
      if(key==='sqrt'&&value<0) throw new Error('負の数の平方根は計算できません');
      calculatorPut(key==='sqrt'?Math.sqrt(value):
        (calculator.op==='+'||calculator.op==='-')?calculator.acc*value/100:value/100);
      calculator.awaiting=false; calculator.replace=true; calculator.lastOp=null; calculator.lastValue=null;
    }else if(key==='sign'){
      calculator.display=calculator.awaiting?'-0':calculator.display.startsWith('-')?calculator.display.slice(1):'-'+calculator.display;
      // Signing zero before typing must allow the next digit to make a negative operand.
      if(value===0||calculator.awaiting) calculator.replace=false;
      calculator.awaiting=false; calculator.lastOp=null; calculator.lastValue=null;
    }else if(key==='mr'){
      calculatorPut(calculator.memory); calculator.awaiting=false; calculator.replace=true;
      calculator.lastOp=null; calculator.lastValue=null;
    }else if(key==='mplus'||key==='mminus'){
      calculator.memory=calculatorRound(calculator.memory+(key==='mplus'?value:-value));
      calculator.replace=true;
    }
  }catch(error){
    calculator=calculatorState(calculator.memory); calculator.display='エラー'; calculator.error=error.message;
  }
}
function calculatorRender(){
  $('calcDisplay').textContent=calculator.display;
  $('calcStatus').textContent=calculator.error||[calculator.memory!==0?'M':'',calcSymbol[calculator.op]||''].filter(Boolean).join('　');
}
let calculatorPosition=null;
function calculatorPlace(){
  const el=$('calculator');
  if(el.classList.contains('hide')) return;
  const maxX=Math.max(8,window.innerWidth-el.offsetWidth-8);
  const maxY=Math.max(8,window.innerHeight-el.offsetHeight-8);
  const pos=calculatorPosition||{x:16,y:document.querySelector('header').getBoundingClientRect().bottom+8};
  calculatorPosition={x:Math.max(8,Math.min(pos.x,maxX)),y:Math.max(8,Math.min(pos.y,maxY))};
  el.style.left=calculatorPosition.x+'px'; el.style.top=calculatorPosition.y+'px';
}
function calculatorOpen(on,restoreFocus=true){
  const el=$('calculator');
  if(on===undefined) on=el.classList.contains('hide');
  if(on&&$('btnCalc').classList.contains('hide')) return;
  const focusedInside=el.contains(document.activeElement);
  el.classList.toggle('hide',!on); $('btnCalc').setAttribute('aria-expanded',String(on));
  if(on){calculatorRender();calculatorPlace();el.focus({preventScroll:true});}
  else if(restoreFocus&&focusedInside&&!$('btnCalc').classList.contains('hide')) $('btnCalc').focus({preventScroll:true});
}
function calculatorKey(key){
  if(/^[0-9.+\-*/%=]$/.test(key)) return key;
  return {Enter:'=',Backspace:'back',Delete:'ce'}[key]||null;
}
$('btnCalc').addEventListener('click',()=>calculatorOpen());
$('calcClose').addEventListener('click',()=>calculatorOpen(false));
$('calculator').addEventListener('click',event=>{
  const key=event.target.closest('[data-calc-key]');
  if(key){calculatorPress(key.dataset.calcKey);calculatorRender();}
});
$('calculator').addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey) return;
  if(event.key==='Escape'){event.preventDefault();calculatorOpen(false);return;}
  // Enter and Space retain native button/summary activation after tabbing to a control.
  if(event.key==='Enter'&&event.target!==$('calculator')) return;
  const key=calculatorKey(event.key);
  if(key){event.preventDefault();calculatorPress(key);calculatorRender();}
});
(function calculatorDragInit(){
  const bar=$('calcBar'),el=$('calculator'); let drag=null;
  bar.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button')) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:el.offsetLeft,top:el.offsetTop};
    bar.setPointerCapture(event.pointerId);event.preventDefault();
  });
  bar.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id) return;
    calculatorPosition={x:drag.left+event.clientX-drag.x,y:drag.top+event.clientY-drag.y};
    calculatorPlace();event.preventDefault();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>bar.addEventListener(type,()=>{drag=null;}));
})();
window.addEventListener('resize',calculatorPlace);

/* 旧版の外部サービス用設定と生成結果を端末から削除する。 */
try{
  ['gijutsushi_r7_gemini_key','gijutsushi_r7_gemini_model','gijutsushi_basics_ai_v1']
    .forEach(key=>localStorage.removeItem(key));
}catch(e){}

/* ---------- 学習記録（localStorage、使えない環境ではメモリのみ） ---------- */
const STORE_KEY = 'gijutsushi_r7_history_v1';
const UNSURE_KEY = 'gijutsushi_unsure_v1';
let history = {};
let unsure = new Set();
function loadHistory(){
  try{ history = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
  catch(e){ history = {}; }
  if(!history||typeof history!=='object'||Array.isArray(history)) history={};
  for(const id of Object.keys(history)) if(QUESTION_BY_ID.has(id)) history[id]=normalizeStudyRecord(id,history[id]);
  try{ unsure = new Set(JSON.parse(localStorage.getItem(UNSURE_KEY) || '[]')); }
  catch(e){ unsure = new Set(); }
}
function saveHistory(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(history)); }catch(e){}
}
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

const COMPARISON_CARDS=TEXTBOOK.comparisonCards||[];
function bookImageSource(image){
  if(image.src)return image.src;
  const id=image.assetId,assets=TEXTBOOK.imageAssets||(TEXTBOOK.imageAssets={});
  if(assets[id])return assets[id];
  const payload=document.getElementById('textbook-image-'+id);
  if(!payload)return '';
  assets[id]=JSON.parse(payload.textContent);payload.remove();return assets[id];
}
function comparisonMatches(card,q){
  if(card.topicIds?.some(id=>id===q.topicId||q.relatedTopicIds?.includes(id)))return true;
  const text=[q.question,...(q.choices||[]),q.explanation,...(q.basics||[])].join(' ').toUpperCase();
  return card.keywords.some(word=>/^[A-Za-z]+$/.test(word)
    ?new RegExp(`(^|[^A-Z])${word.toUpperCase()}([^A-Z]|$)`).test(text):text.includes(word.toUpperCase()));
}
function comparisonCardsFor(q){
  return COMPARISON_CARDS.filter(card=>comparisonMatches(card,q));
}
function comparisonQuestions(card){return QUESTIONS.filter(q=>comparisonMatches(card,q));}
function startComparisonPractice(questions){
  if(!questions.length)return;
  const topicId=typeof bookState!=='undefined'&&!$('textbook').classList.contains('hide')?bookState.topicId:null;
  startQuiz(questions,'study',topicId?{textbookTopicId:topicId,textbookScroll:window.scrollY}:{});
}
function renderComparisonCards(host,cards){
  host.replaceChildren();
  cards.forEach(card=>{
    const section=document.createElement('details');section.className='comparisonCard';
    const title=document.createElement('summary');title.textContent=card.title;section.appendChild(title);
    section.addEventListener('toggle',()=>{
      if(!section.open)return;section.replaceChildren(title);
      const body=document.createElement('div');body.className='comparisonBody';
      const takeaway=document.createElement('p');takeaway.className='bookEmpty';takeaway.textContent=card.takeaway;body.appendChild(takeaway);
      if(card.image){const fig=document.createElement('figure');fig.className='comparisonFigure';
        const img=document.createElement('img');img.src=bookImageSource(card.image);img.alt=card.image.alt;img.loading='lazy';img.decoding='async';
        const caption=document.createElement('figcaption');caption.textContent=card.image.caption;fig.append(img,caption);body.appendChild(fig);}
      const wrap=document.createElement('div');wrap.className='bookTableWrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',card.title+'比較表');
      const table=document.createElement('table');table.className='bookTable';
      const head=document.createElement('thead'),tr=document.createElement('tr');
      ['用語','意味・公式','使う条件','間違えやすい点'].forEach(label=>{const th=document.createElement('th');th.scope='col';th.textContent=label;tr.appendChild(th);});head.appendChild(tr);table.appendChild(head);
      const rows=document.createElement('tbody');card.terms.forEach(term=>{
        const row=document.createElement('tr');term.forEach((value,i)=>{const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=value;row.appendChild(cell);});rows.appendChild(row);
      });table.appendChild(rows);wrap.appendChild(table);body.appendChild(wrap);
      const example=document.createElement('p');example.textContent=card.example;body.appendChild(example);
      const ref=document.createElement('p');ref.className='meta';
      const source=document.createElement('a');source.href=card.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent=card.sourceTitle;
      ref.appendChild(source);const checked=document.createElement('span');checked.textContent=`（確認 ${card.checked}）`;ref.appendChild(checked);body.appendChild(ref);
      const qs=comparisonQuestions(card),questions=document.createElement('details');questions.className='basicsDetails';
      const summary=document.createElement('summary');summary.textContent=`関連する全過去問（${qs.length}問）`;questions.appendChild(summary);
      const all=bookButton(`関連する全${qs.length}問を解く`,()=>startComparisonPractice(comparisonQuestions(card)),'btn btn-primary btn-sm');all.disabled=!qs.length;questions.appendChild(all);
      qs.forEach(q=>{const row=document.createElement('div');row.className='bookQuestion';
        const label=document.createElement('span');label.textContent=`${q.year} ${q.number}｜${q.subject}｜${bookStatus(q)}`;
        row.append(label,bookButton('この問題を解く',()=>startComparisonPractice([q]),'btn btn-ghost btn-sm'));questions.appendChild(row);
      });body.appendChild(questions);section.appendChild(body);
    });host.appendChild(section);
  });
}
function bookComparisons(topicId){
  const cards=COMPARISON_CARDS.filter(c=>c.topicIds.includes(topicId));if(!cards.length)return null;
  const section=bookNode('section','bookComparisons'),heading=bookNode('h3','','混同しやすい用語・公式');
  heading.id='bookComparisonsHeading';heading.tabIndex=-1;section.appendChild(heading);
  const host=bookNode('div');renderComparisonCards(host,cards);section.appendChild(host);return section;
}

function mistakeLabels(){return ['知識不足','公式の選び間違い','計算・単位ミス','読み違い'];}
function mistakeReasonStats(events){
  const mistakes=events.filter(a=>a.ok===false&&a.scored!==false),counts=Object.fromEntries([...mistakeLabels(),'未選択'].map(reason=>[reason,0]));
  mistakes.forEach(a=>counts[mistakeLabels().includes(a.mistakeReason)?a.mistakeReason:'未選択']++);
  return {total:mistakes.length,counts};
}
function setMistakeReason(questionId,attemptId,reason){
  const attempt=history[questionId]?.attempts?.find(a=>a.id===attemptId);
  if(!attempt||attempt.ok!==false||attempt.scored===false||(reason!==''&&!mistakeLabels().includes(reason))) return false;
  attempt.mistakeReason=reason||null;attempt.reasonAt=Math.max(Date.now(),(attempt.reasonAt||0)+1);saveHistory();return true;
}
function mistakeReasonControl(q,attempt,onChange){
  const label=document.createElement('label');label.className='mistakeControl';
  const text=document.createElement('span');text.textContent='間違えた理由（任意）';
  const select=document.createElement('select');select.setAttribute('aria-label',`${q.year} ${q.number} 間違えた理由`);
  ['',...mistakeLabels()].forEach(reason=>{const option=document.createElement('option');option.value=reason;option.textContent=reason||'未選択';select.appendChild(option);});
  select.value=attempt.mistakeReason||'';
  select.addEventListener('change',()=>{if(setMistakeReason(q.id,attempt.id,select.value)) onChange?.();});
  label.appendChild(text);label.appendChild(select);return label;
}
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
function record(id, ok,detail={}){
  const h = normalizeStudyRecord(id,history[id]);
  const q=QUESTION_BY_ID.get(id),at=Number.isFinite(detail.at)?detail.at:Date.now(),today=studyDayKey(at);
  const previous=studyReviewSchedule(q,h,today);
  h.n++; if(ok) h.ok++;
  h.lastOk = ok; h.at = at;
  h.attempts.push({id:`${id}-${at}-${Math.random().toString(36).slice(2,10)}`,at,
    answer:Number.isInteger(detail.answer)?detail.answer:null,mode:detail.mode||'study',
    ok:q&&isNoAnswer(q)?null:ok,scored:!q||!isNoAnswer(q)});
  if(q&&q.kind!=='prediction'&&!isNoAnswer(q)){
    if(!ok) h.review={stage:0,due:studyDayAfter(today,1)};
    else if(previous&&previous.due<=today){
      const stage=Math.min(4,previous.stage+1);h.review={stage,due:studyDayAfter(today,reviewInterval(stage))};
    }else h.review=previous;
  }
  history[id] = h; saveHistory();return h.attempts.at(-1).id;
}
function dueReviewQuestions(topicId=null,today=studyDayKey()){
  return QUESTIONS.filter(q=>{
    if(topicId&&q.topicId!==topicId&&!q.relatedTopicIds?.includes(topicId)) return false;
    const schedule=studyReviewSchedule(q,history[q.id],today);return schedule&&schedule.due<=today;
  }).sort((a,b)=>studyReviewSchedule(a,history[a.id],today).due.localeCompare(studyReviewSchedule(b,history[b.id],today).due)||
    Number(history[b.id].lastOk===false)-Number(history[a.id].lastOk===false)||a.id.localeCompare(b.id));
}
function dueReviewThemes(){
  const groups=new Map();
  dueReviewQuestions().forEach(q=>{
    const key=q.topicId||q.subject;
    if(!groups.has(key))groups.set(key,{key,topic:BOOK_TOPIC_BY_ID.get(q.topicId),subject:q.subject,questions:[],n:0,ok:0});
    groups.get(key).questions.push(q);
  });
  QUESTIONS.forEach(q=>{
    if(q.kind==='prediction'||isNoAnswer(q))return;
    const group=groups.get(q.topicId||q.subject),h=history[q.id];
    if(group&&h?.n>0){group.n+=h.n;group.ok+=h.ok||0;}
  });
  return [...groups.values()].map(g=>({...g,rate:g.n?g.ok/g.n:null}))
    .sort((a,b)=>(a.rate??1)-(b.rate??1)||b.questions.length-a.questions.length||a.key.localeCompare(b.key));
}
function orderedDueReviewQuestions(){return dueReviewThemes().flatMap(g=>g.questions);}
function renderDueReview(){
  const due=dueReviewQuestions(),scheduled=QUESTIONS.map(q=>studyReviewSchedule(q,history[q.id])).filter(Boolean);
  const card=$('dueReviewCard');card.classList.toggle('hide',!scheduled.length);
  const counts=SUBJECT_ORDER.map(s=>`${s==='専門科目(建設部門)'?'建設部門':s} ${due.filter(q=>q.subject===s).length}問`).join('／');
  const next=scheduled.filter(s=>s.due>studyDayKey()).map(s=>s.due).sort()[0];
  $('dueReviewInfo').textContent=due.length?`${due.length}問の復習日が来ています（${counts}）。`:
    `今日の復習は0問です。${next?`次の復習日は${next}です。`:''}`;
  const host=$('dueReviewThemes');host.replaceChildren();
  if(due.length)host.appendChild(bookNode('p','meta','主テーマ別・累計正答率の低い順（公式過去問の全解答で集計）'));
  dueReviewThemes().forEach(group=>{
    const row=bookNode('div','bookSection');
    row.appendChild(bookNode('strong','',group.topic?.title||`${group.subject}（テーマ未分類）`));
    row.appendChild(bookNode('p','meta',`${group.subject} ／ 累計正答率 ${group.rate===null?'未解答':Math.round(group.rate*100)+'%'}（${group.ok}/${group.n}回） ／ 今日の復習 ${group.questions.length}問`));
    const actions=bookNode('div','recommendationActions');
    actions.appendChild(bookButton(`このテーマを復習（${group.questions.length}問）`,()=>startQuiz(group.questions.slice(),'study'),'btn btn-primary btn-sm'));
    if(group.topic)actions.appendChild(bookButton('教科書を開く',()=>bookShow(group.topic.subject,group.topic.parentId,group.topic.id),'btn btn-ghost btn-sm'));
    row.appendChild(actions);host.appendChild(row);
  });
  $('btnDueReview').disabled=!due.length;$('btnDueReviewAll').classList.toggle('hide',due.length<=10);
  $('btnDueReview').textContent=`復習を${Math.min(10,due.length)}問始める`;
}
$('btnDueReview').addEventListener('click',()=>{const due=orderedDueReviewQuestions().slice(0,10);if(due.length)startQuiz(due,'study');});
$('btnDueReviewAll').addEventListener('click',()=>{const due=orderedDueReviewQuestions();if(due.length)startQuiz(due,'study');});
// Refresh the day boundary when returning to the app, without interrupting a quiz.
window.addEventListener('focus',()=>{if(!$('setup').classList.contains('hide'))renderDueReview();});
function saveUnsure(){ try{ localStorage.setItem(UNSURE_KEY,JSON.stringify([...unsure])); }catch(e){} }

/* ---------- 設定画面 ---------- */
const years    = uniq(QUESTIONS.map(q=>q.year));
const subjects = SUBJECT_ORDER.filter(s=>QUESTIONS.some(q=>q.subject===s));
const groups   = uniq(QUESTIONS.filter(q=>q.group).map(q=>q.group)).sort();
const fields   = uniq(QUESTIONS.filter(q=>q.subject==='専門科目(建設部門)' && q.field).map(q=>q.field));
const aptitudeQuestions = QUESTIONS.filter(q=>q.subject==='適性科目');
const aptitudeCounts = Object.create(null);
aptitudeQuestions.forEach(q=>{ aptitudeCounts[q.theme]=(aptitudeCounts[q.theme]||0)+1; });
const aptitudeMajor = Object.keys(aptitudeCounts).filter(t=>aptitudeCounts[t]>=5)
  .sort((a,b)=>aptitudeCounts[b]-aptitudeCounts[a] || a.localeCompare(b,'ja'));
const aptitudeMajorSet = new Set(aptitudeMajor);
const aptitudeTopics = [...aptitudeMajor, 'その他'];
const aptitudeOtherCount = aptitudeQuestions.filter(q=>!aptitudeMajorSet.has(q.theme)).length;
const aptitudeTopic = q => aptitudeMajorSet.has(q.theme) ? q.theme : 'その他';
const aptitudeLabel = t => t==='その他' ? `その他（${aptitudeOtherCount}問）` : `${t}（${aptitudeCounts[t]}問）`;
const SETUP_STORE = 'gijutsushi_setup_v1';
let savedSetup = null;
try{ savedSetup = JSON.parse(localStorage.getItem(SETUP_STORE) || 'null'); }catch(e){}
function validSelection(saved, available, fallback){
  return new Set(Array.isArray(saved) ? saved.filter(x=>available.includes(x)) : fallback);
}
const sel = {
  years:validSelection(savedSetup&&savedSetup.years, years, [years[0]]),
  subjects:validSelection(savedSetup&&savedSetup.subjects, subjects, subjects),
  groups:validSelection(savedSetup&&savedSetup.groups, groups, groups),
  aptitudeTopics:validSelection(savedSetup&&savedSetup.aptitudeTopics, aptitudeTopics, aptitudeTopics),
  fields:validSelection(savedSetup&&savedSetup.fields, fields, fields)
};
function restoreChoice(id, value){
  if(value===undefined || value===null) return;
  const el=$(id);
  if([...el.options].some(o=>o.value===String(value))) el.value=String(value);
}
if(savedSetup){
  restoreChoice('selOrder',savedSetup.order);
  restoreChoice('selFilter',savedSetup.filter);
  restoreChoice('selCount',savedSetup.count);
  if(typeof savedSetup.shuffleChoices==='boolean') $('chkShuffleChoices').checked=savedSetup.shuffleChoices;
  const mode=[...document.querySelectorAll('input[name=mode]')].find(el=>el.value===savedSetup.mode);
  const type=[...document.querySelectorAll('input[name=qtype]')].find(el=>el.value===savedSetup.qtype);
  if(mode) mode.checked=true;
  if(type) type.checked=true;
}
$('chipShuffleChoices').classList.toggle('on',$('chkShuffleChoices').checked);
$('chkShuffleChoices').addEventListener('change',()=>{
  $('chipShuffleChoices').classList.toggle('on',$('chkShuffleChoices').checked); saveSetup();
});
function saveSetup(){
  const data={years:[...sel.years],subjects:[...sel.subjects],groups:[...sel.groups],
    aptitudeTopics:[...sel.aptitudeTopics],fields:[...sel.fields],
    order:$('selOrder').value,filter:$('selFilter').value,count:$('selCount').value,
    mode:curMode(),qtype:document.querySelector('input[name=qtype]:checked').value,
    shuffleChoices:$('chkShuffleChoices').checked,homeSubject:$('homeSubject').value};
  try{ localStorage.setItem(SETUP_STORE,JSON.stringify(data)); }catch(e){}
}

function buildChips(host, items, set, labelFn){
  host.innerHTML = '';
  items.forEach(v=>{
    const l = document.createElement('label');
    l.className = 'chip' + (set.has(v) ? ' on' : '');
    l.innerHTML = `<input type="checkbox" ${set.has(v)?'checked':''}><span>${labelFn?labelFn(v):v}</span>`;
    l.querySelector('input').addEventListener('change', e=>{
      if(e.target.checked) set.add(v); else set.delete(v);
      l.classList.toggle('on', e.target.checked);
      refreshSetup();
    });
    host.appendChild(l);
  });
}
function groupLabel(g){
  const q = QUESTIONS.find(x=>x.group===g);
  return q && q.groupName ? `${g}：${q.groupName}` : g;
}
buildChips($('yearChips'),  years,    sel.years);
buildChips($('subjChips'),  subjects, sel.subjects);
buildChips($('groupChips'), groups,   sel.groups, groupLabel);
buildChips($('aptitudeMajorChips'), aptitudeMajor, sel.aptitudeTopics, aptitudeLabel);
buildChips($('aptitudeOtherChips'), ['その他'], sel.aptitudeTopics, aptitudeLabel);
buildChips($('fieldChips'), fields,    sel.fields);

/* 年度・科目・基礎科目の群・適性科目のテーマ・建設部門の11分野を適用 */
function poolQuestions(){
  const useGroup = sel.subjects.has('基礎科目');
  const useAptitude = sel.subjects.has('適性科目');
  const useField = sel.subjects.has('専門科目(建設部門)');
  return QUESTIONS.filter(q=>
    sel.years.has(q.year) && sel.subjects.has(q.subject) &&
    (q.subject!=='基礎科目' || !useGroup || !q.group || sel.groups.has(q.group)) &&
    (q.subject!=='適性科目' || !useAptitude || sel.aptitudeTopics.has(aptitudeTopic(q))) &&
    (q.subject!=='専門科目(建設部門)' || !useField || sel.fields.has(q.field))
  );
}

/* 模試モード：本番1回分と同じ構成で出題セットを組む。
   選択した科目・群の分だけを本番の問題数どおりに集める。
   （例：基礎科目だけなら30問、さらに1群だけなら6問、全科目なら80問） */
function shuffled(a){
  const s = a.slice();
  for(let i=s.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [s[i],s[j]]=[s[j],s[i]]; }
  return s;
}
function pickExamSet(){
  const pool = poolQuestions();
  const bySubj = {};
  pool.forEach(q=>{ (bySubj[q.subject]||(bySubj[q.subject]=[])).push(q); });
  const out = [];
  SUBJECT_ORDER.forEach(s=>{
    const comp = EXAM_COMP[s], cands = bySubj[s];
    if(!comp || !cands) return;
    const byGenre = {};
    cands.forEach(q=>{ (byGenre[q.genre]||(byGenre[q.genre]=[])).push(q); });
    const genres = GENRE_ORDER[s] || Object.keys(comp);
    let target = 0; const picked = [], used = new Set();
    genres.forEach(g=>{
      const want = comp[g]||0, cand = byGenre[g];
      if(!want || !cand || !cand.length) return;
      target += want;
      shuffled(cand).slice(0, Math.min(want, cand.length))
        .forEach(q=>{ picked.push(q); used.add(q.id); });
    });
    /* 単年度だけを選んだときなど、その年のジャンル内訳が本番の平均と違って
       目標問題数に届かないことがある。足りない分は同じ科目の残りから補う。 */
    if(picked.length < target){
      shuffled(cands.filter(q=>!used.has(q.id))).slice(0, target-picked.length)
        .forEach(q=>{ picked.push(q); used.add(q.id); });
    }
    const gi = {}; genres.forEach((g,i)=>gi[g]=i);
    picked.sort((a,b)=> (gi[a.genre]??999) - (gi[b.genre]??999));
    out.push(...picked);
  });
  /* 「試験順」を選んでいるときはジャンル内も本番の問題番号順に戻す。
     複数年度から集めても「1回分の試験」として並べたいので、年度では並べ替えない。 */
  if($('selOrder').value==='seq'){
    const si={}; SUBJECT_ORDER.forEach((s,i)=>si[s]=i);
    const num = q => parseInt((q.number.match(/(\d+)\s*$/)||[0,0])[1],10);
    out.sort((a,b)=> ((si[a.subject]??99)-(si[b.subject]??99))
                     || (genreRank(a)-genreRank(b)) || (num(a)-num(b)));
  }
  return out;
}

function pickQuestions(){
  if(curMode()==='exam') return pickExamSet();
  let list = poolQuestions();
  const f = $('selFilter').value;
  if(f==='unseen') list = list.filter(q=>!bookQuestionAnswered(q));
  if(f==='wrong')  list = list.filter(q=>bookQuestionAnswered(q) && history[q.id].lastOk===false);
  const qtype = document.querySelector('input[name=qtype]:checked').value;
  if(qtype==='calc') list = list.filter(q=>q.calc===true);
  const ord = $('selOrder').value;
  if(ord==='rand'){
    list = list.slice();
    for(let i=list.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [list[i],list[j]]=[list[j],list[i]]; }
  }else if(ord==='genre'){
    list = genreShuffle(list);
  }
  /* 練習モードの「出題数」は累積出題の上限（S.limit）であって母集団の絞り込みではないため、
     ここでは切り詰めない（切り詰めると基本キュー自体がN問になり、類似問題の割り込みや
     一巡後の復習周が正しく機能しなくなる）。 */
  if(curMode()!=='practice'){
    const n = parseInt($('selCount').value,10);
    if(n>0) list = list.slice(0,n);
  }
  return list;
}

/* 年度・科目・ジャンルのブロック順はそのままに、ジャンルの中だけをシャッフルする。
   （例：1群の6問が 4→3→5→6→1→2 の順になるが、1群の次は必ず2群） */
function genreShuffle(list){
  const yearIdx = {}; years.forEach((y,i)=>yearIdx[y]=i);
  const subjIdx = {}; SUBJECT_ORDER.forEach((s,i)=>subjIdx[s]=i);
  return list.map(q=>({q, r:Math.random()}))
    .sort((a,b)=>
      ((yearIdx[a.q.year]??99) - (yearIdx[b.q.year]??99)) ||
      ((subjIdx[a.q.subject]??99) - (subjIdx[b.q.subject]??99)) ||
      (genreRank(a.q) - genreRank(b.q)) ||
      (a.r - b.r))
    .map(e=>e.q);
}
function refreshSetup(){
  ['Study','Exam','Practice'].forEach(name=>{
    const chip=$('chip'+name); chip.classList.toggle('on',chip.querySelector('input').checked);
  });
  ['All','Calc'].forEach(name=>{
    const chip=$('chipType'+name); chip.classList.toggle('on',chip.querySelector('input').checked);
  });
  $('modeNote').textContent = MODE_NOTE[curMode()] || '';
  const on = sel.subjects.has('基礎科目');
  $('groupChips').querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('dim', !on);
    c.querySelector('input').disabled = !on;
  });
  const aptitudeOn = sel.subjects.has('適性科目');
  document.querySelectorAll('#aptitudeMajorChips .chip, #aptitudeOtherChips .chip').forEach(c=>{
    c.classList.toggle('dim', !aptitudeOn);
    c.querySelector('input').disabled = !aptitudeOn;
  });
  $('btnAptitudeAll').disabled = !aptitudeOn;
  $('btnAptitudeNone').disabled = !aptitudeOn;
  const predAptitudeCount = PREDICTIONS.filter(q=>q.subject==='適性科目' && sel.aptitudeTopics.has(aptitudeTopic(q))).length;
  $('btnPredTekisei').textContent = `適性${predAptitudeCount}問（選択テーマ）`;
  $('btnPredTekisei').disabled = !aptitudeOn || predAptitudeCount===0;
  const fieldOn = sel.subjects.has('専門科目(建設部門)');
  $('fieldChips').querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('dim', !fieldOn);
    c.querySelector('input').disabled = !fieldOn;
  });
  $('btnFieldsAll').disabled = !fieldOn;
  $('btnFieldsNone').disabled = !fieldOn;
  updateAvailability();
  const predFieldCount = PREDICTIONS.filter(q=>q.subject==='専門科目(建設部門)' && sel.fields.has(q.field)).length;
  $('btnPredKensetsu').textContent = `建設${predFieldCount}問（選択分野）`;
  $('btnPredKensetsu').disabled = !fieldOn || predFieldCount===0;
  /* 模試モードは本番と同じ構成で出題するため、絞り込み・出題数・問題タイプは使わない */
  const exam = curMode()==='exam';
  $('selFilter').disabled = exam;
  $('selCount').disabled  = exam;
  document.querySelectorAll('input[name=qtype]').forEach(r=>{ r.disabled = exam; });
  $('chipTypeAll').classList.toggle('dim', exam);
  $('chipTypeCalc').classList.toggle('dim', exam);
  /* 模試モードは「完全ランダム」だとジャンルが混ざって本番の構成にならないため選択肢自体を無効化する */
  $('optRandOrder').disabled = exam;
  if(exam && $('selOrder').value==='rand') $('selOrder').value='genre';

  const list = pickQuestions();
  const n = list.length;
  if(exam){
    const by = {};
    list.forEach(q=>{ by[q.subject]=(by[q.subject]||0)+1; });
    const detail = SUBJECT_ORDER.filter(s=>by[s]).map(s=>`${s} ${by[s]}問`).join('／');
    $('setupCount').textContent = `選択範囲から年度1回分の構成で ${n} 問${detail?'（'+detail+'）':''}`;
  }else if(curMode()==='practice'){
    const limit = parseInt($('selCount').value,10)||0;
    $('setupCount').textContent = limit>0 ? `対象 ${n} 問（${limit}問に達したら採点）` : `対象 ${n} 問（上限なし。手動で採点するまで続けられます）`;
  }else{
    $('setupCount').textContent = `対象 ${n} 問`;
  }
  $('btnStart').disabled = n===0;
  saveSetup();
  renderStats();
  if($('frequencyCard').open) renderFrequency();
}
function updateAvailability(){
  const selected = QUESTIONS.filter(q=>sel.years.has(q.year));
  const count = pred => selected.filter(pred).length;
  function show(hostId, items, label, pred){
    const chips=$(`${hostId}`).querySelectorAll('.chip');
    items.forEach((item,i)=>{
      const n=count(q=>pred(q,item));
      const chip=chips[i];
      if(!chip) return;
      chip.querySelector('span').textContent=`${label(item)}（選択年度 ${n}問）`;
      chip.classList.toggle('zero',n===0);
      chip.title=n===0?'選択年度に該当する問題はありません':'';
    });
  }
  show('groupChips',groups,g=>groupLabel(g),(q,g)=>q.subject==='基礎科目'&&q.group===g);
  show('aptitudeMajorChips',aptitudeMajor,t=>t,(q,t)=>q.subject==='適性科目'&&aptitudeTopic(q)===t);
  show('aptitudeOtherChips',['その他'],t=>t,(q,t)=>q.subject==='適性科目'&&aptitudeTopic(q)===t);
  show('fieldChips',fields,f=>f,(q,f)=>q.subject==='専門科目(建設部門)'&&q.field===f);
}
function setYears(list){
  sel.years = new Set(list);
  buildChips($('yearChips'), years, sel.years);
  refreshSetup();
}
$('btnYearAll').addEventListener('click', ()=>setYears(years));
$('btnYearLatest').addEventListener('click', ()=>setYears([years[0]]));
function setFields(list){
  sel.fields = new Set(list);
  buildChips($('fieldChips'), fields, sel.fields);
  refreshSetup();
}
$('btnFieldsAll').addEventListener('click', ()=>setFields(fields));
$('btnFieldsNone').addEventListener('click', ()=>setFields([]));
function setAptitudeTopics(list){
  sel.aptitudeTopics = new Set(list);
  buildChips($('aptitudeMajorChips'), aptitudeMajor, sel.aptitudeTopics, aptitudeLabel);
  buildChips($('aptitudeOtherChips'), ['その他'], sel.aptitudeTopics, aptitudeLabel);
  refreshSetup();
}
$('btnAptitudeAll').addEventListener('click', ()=>setAptitudeTopics(aptitudeTopics));
$('btnAptitudeNone').addEventListener('click', ()=>setAptitudeTopics([]));

$('selFilter').addEventListener('change', refreshSetup);
$('selOrder').addEventListener('change', refreshSetup);
$('selCount').addEventListener('change', refreshSetup);
const MODE_NOTE = {
  study:   '1問ずつ採点します。間違えるとその分野の基礎知識を表示します。',
  exam:    '年度1回分の分野別問題数を目安に出題し、最後にまとめて採点します（全科目・全分野なら80問）。選んだ科目・基礎の群・適性のテーマ・建設の分野に応じて問題数が変わります。絞り込み・出題数・問題タイプは使えません。',
  practice:'選んだ範囲を出題順どおりに1問ずつ出します。間違えるとその場で類似問題を割り込ませ（最大2問連続）、一巡したら間違えた問題だけを解き直します。「ここまでで採点する」でいつでも集計できます。',
};
function curMode(){ return document.querySelector('input[name=mode]:checked').value; }
document.querySelectorAll('input[name=mode]').forEach(r=>{
  r.addEventListener('change', ()=>{
    $('chipStudy').classList.toggle('on', $('chipStudy').querySelector('input').checked);
    $('chipExam').classList.toggle('on', $('chipExam').querySelector('input').checked);
    $('chipPractice').classList.toggle('on', $('chipPractice').querySelector('input').checked);
    const m = curMode();
    /* 模試モードで「完全ランダム」だとジャンルが混ざるので、ジャンル内ランダムに寄せる */
    if(m==='exam' && $('selOrder').value==='rand') $('selOrder').value='genre';
    $('modeNote').textContent = MODE_NOTE[m] || '';
    refreshSetup();
  });
});
$('modeNote').textContent = MODE_NOTE[curMode()];
document.querySelectorAll('input[name=qtype]').forEach(r=>{
  r.addEventListener('change', ()=>{
    $('chipTypeAll').classList.toggle('on', $('chipTypeAll').querySelector('input').checked);
    $('chipTypeCalc').classList.toggle('on', $('chipTypeCalc').querySelector('input').checked);
    refreshSetup();
  });
});
const CALC_TOTAL = QUESTIONS.filter(q=>q.calc===true).length;
$('calcNote').textContent = CALC_TOTAL
  ? `※「計算問題のみ」は選択肢の形式から自動判定したもの（全${CALC_TOTAL}問）。適性科目には計算問題がないため対象外です。判定にごく一部の誤りが含まれる場合があります。`
  : '';

/* ---------- 学習記録のグラフ（元の記録は変更しない） ---------- */
function chartRow(label,value,total,detail='',color='var(--accent)'){
  const row=bookNode('div','chartRow'),head=bookNode('div','chartRowHead');
  head.append(bookNode('span','',label),bookNode('span','',detail||`${value} / ${total}`));
  const track=bookNode('div','chartTrack'),fill=bookNode('div','chartFill');
  const noQuestions=label==='過去問'&&total===0;
  const ratio=noQuestions?100:total?Math.max(0,Math.min(100,value/total*100)):0;
  track.setAttribute('role','img');track.setAttribute('aria-label',noQuestions?'過去問：0 / 0問（過去問なし・対象外）':`${label}：${detail||`${value} / ${total}`}（${Math.round(ratio)}%）`);
  fill.style.width=ratio+'%';fill.style.background=noQuestions?'repeating-linear-gradient(135deg,var(--sub) 0 5px,var(--line) 5px 10px)':color;track.appendChild(fill);row.append(head,track);return row;
}
function chartPanel(title){const panel=bookNode('section','chartPanel');panel.appendChild(bookNode('h3','',title));return panel;}
function bookLearningSummary(topics){return {total:topics.length,done:topics.filter(t=>bookLearned.has(t.id)).length};}
function renderBookLearningChart(){
  const host=$('bookLearningChart');if(!host)return;
  host.replaceChildren();host.classList.toggle('hide',!!bookState.topicId);
  $('bookSelection')?.classList.toggle('card',!bookState.topicId);
  if(bookState.topicId)return;
  const scope=TEXTBOOK.parents.find(p=>p.id===bookState.parentId)||TEXTBOOK.subjects.find(s=>s.id===bookState.subject);
  host.appendChild(bookNode('h2','',scope?scope.title+'｜学習状況・テーマ選択':'学習状況・テーマ選択'));
  const topics=TEXTBOOK.topics.filter(t=>(!bookState.subject||t.subject===bookState.subject)&&(!bookState.parentId||t.parentId===bookState.parentId));
  const all=bookLearningSummary(topics);
  host.appendChild(chartRow('教科書の学習済み',all.done,all.total,`${all.done} / ${all.total}テーマ（${all.total?Math.round(all.done/all.total*100):0}%）`));
  host.appendChild(bookNode('p','meta','学習状況を確認しながら、科目・分野・テーマを選べます。教科書のチェックと過去問の実施は別々に表示します。正答率は正答なし問題を除きます。'));
}
function recordChartData(subject='all',source='all'){
  const questions=[...QUESTIONS,...PREDICTIONS].filter(q=>(subject==='all'||q.subject===subject)&&
    (source==='all'||(source==='prediction')===(q.kind==='prediction')));
  const answered=questions.filter(q=>history[q.id]?.n>0);
  const events=questions.flatMap(q=>(history[q.id]?.attempts||[]).map(a=>({...a,q})));
  const total=answered.reduce((n,q)=>n+history[q.id].n,0);
  const correct=answered.reduce((n,q)=>n+history[q.id].ok,0);
  const timed=events.length;
  const scoredQuestions=answered.filter(q=>!isNoAnswer(q));
  const scoredTotal=scoredQuestions.reduce((n,q)=>n+history[q.id].n,0);
  const scoredCorrect=scoredQuestions.reduce((n,q)=>n+history[q.id].ok,0);
  const subjectIds=new Set(TEXTBOOK.subjects.filter(s=>subject==='all'||s.title===subject).map(s=>s.id));
  const topics=TEXTBOOK.topics.filter(t=>subjectIds.has(t.subject));
  const review=questions.filter(q=>q.kind!=='prediction').map(q=>({q,schedule:studyReviewSchedule(q,history[q.id])})).filter(r=>r.schedule);
  return {questions,answered,events,total,correct,scoredTotal,scoredCorrect,timed,topics,review,
    unsure:questions.filter(q=>unsure.has(q.id)),
    missingDates:Math.max(0,total-timed)};
}
function renderRecordCharts(){
  const host=$('recordCharts');if(!host)return;host.replaceChildren();
  const data=recordChartData($('chartSubject').value,$('chartSource').value);
  const {questions,answered,events,total,correct,topics,review}=data;
  const grid=bookNode('div','chartGrid');host.appendChild(grid);
  const overview=chartPanel('解答の全体像');grid.appendChild(overview);
  overview.appendChild(chartRow('実施した問題',answered.length,questions.length,`${answered.length} / ${questions.length}問`));
  overview.appendChild(chartRow('累計の正解',data.scoredCorrect,data.scoredTotal,`${data.scoredCorrect} / ${data.scoredTotal}回（${data.scoredTotal?Math.round(data.scoredCorrect/data.scoredTotal*100)+'%':'未計測'}）`,'var(--ok)'));
  overview.appendChild(bookNode('p','meta',`累計解答 ${total}回。正答なし問題の解答も回数に含みます。正答率は正答なし問題を除きます。日時付き履歴 ${events.length}件、日時のない旧記録 ${data.missingDates}回。旧記録の日時は推定しません。`));
  const subjectPanel=chartPanel('科目別の実施数と直近正答率');grid.appendChild(subjectPanel);
  SUBJECT_ORDER.forEach(subject=>{const qs=questions.filter(q=>q.subject===subject);if(!qs.length)return;
    const stats=learningGroupStats(qs);subjectPanel.appendChild(chartRow(subject,stats.done,stats.total,`${stats.done} / ${stats.total}問`));
    subjectPanel.appendChild(chartRow('直近正答率',stats.correct,stats.done,stats.rate===null?'未計測':`${Math.round(stats.rate*100)}%（${stats.correct}/${stats.done}問）`,'var(--ok)'));
  });
  const book=chartPanel('教科書の学習済み');grid.appendChild(book);
  TEXTBOOK.subjects.forEach(s=>{const ts=topics.filter(t=>t.subject===s.id);if(!ts.length)return;const n=bookLearningSummary(ts);book.appendChild(chartRow(s.title,n.done,n.total,`${n.done} / ${n.total}テーマ`));});
  book.appendChild(bookNode('p','meta','教科書のチェック状況です。問題種別の絞り込みには影響されません。'));
  const status=chartPanel('問題の状態');grid.appendChild(status);
  const lastWrong=answered.filter(q=>history[q.id].lastOk===false).length;
  const lastCorrect=answered.filter(q=>history[q.id].lastOk===true).length;
  [['直近で正解',lastCorrect,'var(--ok)'],['直近で不正解',lastWrong,'var(--ng)'],['正誤なし',answered.length-lastWrong-lastCorrect,'var(--sub)'],['未実施',questions.length-answered.length,'var(--accent)'],['自信なし',data.unsure.length,'var(--warn)']].forEach(([label,n,color])=>status.appendChild(chartRow(label,n,questions.length,`${n}問`,color)));
  const reasons=chartPanel('間違えた理由');grid.appendChild(reasons);const counts=mistakeReasonStats(events);
  Object.entries(counts.counts).forEach(([label,n])=>reasons.appendChild(chartRow(label,n,counts.total,`${n} / ${counts.total}回`,'var(--ng)')));
  reasons.appendChild(bookNode('p','meta','日時付き・採点対象の不正解履歴を集計しています。'));
  const modes=chartPanel('学習モード別の解答数');grid.appendChild(modes);
  [['study','学習'],['practice','練習'],['exam','模試']].forEach(([mode,label])=>modes.appendChild(chartRow(label,events.filter(e=>e.mode===mode).length,events.length,`${events.filter(e=>e.mode===mode).length}回`)));
  const unknown=events.filter(e=>!['study','practice','exam'].includes(e.mode)).length;
  if(unknown)modes.appendChild(chartRow('モード不明',unknown,events.length,`${unknown}回`));
  const schedule=chartPanel('復習予定');grid.appendChild(schedule);const today=studyDayKey();
  const buckets=[['期限超過',review.filter(r=>r.schedule.due<today).length],['今日',review.filter(r=>r.schedule.due===today).length],['明日〜7日後',review.filter(r=>r.schedule.due>today&&r.schedule.due<=studyDayAfter(today,7)).length],['8日後以降',review.filter(r=>r.schedule.due>studyDayAfter(today,7)).length]];
  buckets.forEach(([label,n])=>schedule.appendChild(chartRow(label,n,review.length,`${n}問`)));
  const stages=chartPanel('復習の定着段階');grid.appendChild(stages);
  [1,3,7,14,30].forEach((days,i)=>stages.appendChild(chartRow(`段階${i+1}・${days}日間隔`,review.filter(r=>r.schedule.stage===i).length,review.length,`${review.filter(r=>r.schedule.stage===i).length}問`)));
  const sourcePanel=chartPanel('問題種別の解答数');grid.appendChild(sourcePanel);
  [['公式過去問',questions.filter(q=>q.kind!=='prediction')],['非公式予想問題',questions.filter(q=>q.kind==='prediction')]].forEach(([label,qs])=>{
    const n=qs.reduce((sum,q)=>sum+(history[q.id]?.n||0),0);sourcePanel.appendChild(chartRow(label,n,total,`${n}回`));
  });
  const memoPanel=chartPanel('手書きメモ');grid.appendChild(memoPanel);
  const memoQuestions=questions.filter(q=>memos[q.id]?.s?.length);
  memoPanel.appendChild(chartRow('メモのある問題',memoQuestions.length,questions.length,`${memoQuestions.length}問`));
  memoPanel.appendChild(bookNode('p','meta',`対象問題の保存ストローク数 ${memoQuestions.reduce((n,q)=>n+memos[q.id].s.length,0)}。共通メモ ${memos.general?.s?.length||0}ストローク。メモの内容は各問題の手書きメモで確認できます。`));
  const daily=chartPanel('日別の解答数・正誤');host.appendChild(daily);
  daily.appendChild(bookNode('p','meta','直近30日：緑＝正解、赤＝不正解、灰色＝正誤なし。グラフ下に日付と件数を表示します。'));
  const days=Array.from({length:30},(_,i)=>studyDayAfter(today,i-29));
  const fullByDay=new Map();events.forEach(e=>{const day=studyDayKey(e.at);if(!fullByDay.has(day))fullByDay.set(day,[]);fullByDay.get(day).push(e);});
  const byDay=new Map(days.map(d=>[d,fullByDay.get(d)||[]]));
  const max=Math.max(1,...[...byDay.values()].map(es=>es.length));
  const scroll=bookNode('div','dailyScroll'),chart=bookNode('div','dailyChart');scroll.appendChild(chart);daily.appendChild(scroll);
  byDay.forEach((es,day)=>{const col=bookNode('div','dailyCol'),bar=bookNode('div','dailyBar');
    const ok=es.filter(e=>e.ok===true&&e.scored!==false).length,ng=es.filter(e=>e.ok===false&&e.scored!==false).length;
    col.setAttribute('aria-label',`${day}：${es.length}回、正解${ok}、不正解${ng}、正誤なし${es.length-ok-ng}`);
    [[ok,'var(--ok)'],[ng,'var(--ng)'],[es.length-ok-ng,'var(--sub)']].forEach(([n,color])=>{const fill=bookNode('i');fill.style.height=(n/max*100)+'%';fill.style.background=color;bar.appendChild(fill);});
    col.append(bookNode('span','',String(es.length)),bar,bookNode('span','',day.slice(5)));chart.appendChild(col);
  });
  const allDays=bookNode('details','basicsDetails');allDays.appendChild(bookNode('summary','','全期間の日別集計'));
  allDays.addEventListener('toggle',()=>{if(!allDays.open||allDays.children.length>1)return;
    const dates=[...fullByDay.keys()].sort();
    if(!dates.length)allDays.appendChild(bookNode('p','meta','日時付きの解答記録はまだありません。'));
    const peak=Math.max(1,...dates.map(d=>fullByDay.get(d).length));
    dates.forEach(d=>{const es=fullByDay.get(d);const scored=es.filter(e=>e.scored!==false&&typeof e.ok==='boolean');const ok=scored.filter(e=>e.ok).length;allDays.appendChild(chartRow(d,es.length,peak,`${es.length}回・正答率 ${scored.length?Math.round(ok/scored.length*100)+'%':'未計測'}`));});
  });daily.appendChild(allDays);
  const detail=bookNode('details','basicsDetails');detail.appendChild(bookNode('summary','','全分野・テーマの進捗と正答率'));
  detail.addEventListener('toggle',()=>{if(!detail.open||detail.children.length>1)return;
    TEXTBOOK.parents.forEach(parent=>{const ts=topics.filter(t=>t.parentId===parent.id);if(!ts.length)return;
      const panel=chartPanel(parent.title);detail.appendChild(panel);
      const ids=new Set(ts.map(t=>t.id)),qs=questions.filter(q=>ids.has(q.topicId));const st=learningGroupStats(qs);
      panel.appendChild(chartRow('分野全体の直近正答率',st.correct,st.done,st.rate===null?'未計測':`${Math.round(st.rate*100)}%（${st.correct}/${st.done}問）`,'var(--ok)'));
      ts.forEach(t=>{const st=learningGroupStats(questions.filter(q=>q.topicId===t.id));
        panel.appendChild(chartRow(`${bookLearned.has(t.id)?'✓ ':''}${t.title}`,st.correct,st.done,`${st.done}/${st.total}問実施・${st.rate===null?'未計測':Math.round(st.rate*100)+'%'}`,'var(--ok)'));
      });
    });
  });host.appendChild(detail);
  const tableDetails=bookNode('details','basicsDetails');tableDetails.appendChild(bookNode('summary','','全問題の保存データを一覧で確認'));
  tableDetails.addEventListener('toggle',()=>{if(!tableDetails.open||tableDetails.children.length>1)return;
    const wrap=bookNode('div','recordTable');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','全問題の保存データ');
    const table=bookNode('table'),thead=bookNode('thead'),tr=bookNode('tr');
    ['問題','種別','解答回数','正解回数','直近の結果','最終解答日時','日時付き履歴','復習日','段階','自信なし','メモ'].forEach(label=>{const th=bookNode('th','',label);th.scope='col';tr.appendChild(th);});thead.appendChild(tr);table.appendChild(thead);
    const tbody=bookNode('tbody');questions.forEach(q=>{const h=history[q.id],r=studyReviewSchedule(q,h),tr=bookNode('tr');
      const values=[`${q.subject} ${q.year} ${q.number}`,q.kind==='prediction'?'予想':'公式',h?.n||0,h?.ok||0,h?.n?(h.lastOk===true?'正解':h.lastOk===false?'不正解':'正誤なし'):'未実施',h?.at?new Date(h.at).toLocaleString('ja-JP'):'—',h?.attempts?.length||0,r?.due||'—',r?String(r.stage+1):'—',unsure.has(q.id)?'あり':'—',memos[q.id]?.s?.length?'あり':'—'];
      values.forEach(v=>tr.appendChild(bookNode('td','',String(v))));tbody.appendChild(tr);
    });table.appendChild(tbody);wrap.appendChild(table);tableDetails.appendChild(wrap);
  });host.appendChild(tableDetails);
}
['chartSubject','chartSource'].forEach(id=>$(id).addEventListener('change',renderRecordCharts));

function renderStats(){
  const box = $('statsBox');
  const rows = [];
  subjects.forEach(s=>{
    const qs = QUESTIONS.filter(q=>q.subject===s);
    const done = qs.filter(bookQuestionAnswered).length;
    const ok   = qs.filter(q=>bookQuestionAnswered(q) && history[q.id].lastOk===true).length;
    const rate = done ? Math.round(ok/done*100) : 0;
    rows.push(`<div class="line"><span>${s}</span><span><b>${done}</b>/${qs.length} 問実施　直近正答率 <b>${done?rate+'%':'—'}</b></span></div>`);
  });
  const wrong = QUESTIONS.filter(q=>bookQuestionAnswered(q) && history[q.id].lastOk===false).length;
  rows.push(`<div class="line"><span>復習が必要な問題（直前に不正解）</span><span><b>${wrong}</b> 問</span></div>`);
  rows.push(`<div class="line"><span>自信なしの問題</span><span><b>${unsure.size}</b> 問</span></div>`);
  box.innerHTML = rows.join('');
  const done=QUESTIONS.filter(bookQuestionAnswered).length;
  $('homeStats').textContent=`過去問 ${done}/${QUESTIONS.length}問 学習済み ・ 復習対象 ${wrong}問`;
  renderRecommendation('homeRecommendation');
  if(homeView==='records') renderRecordCharts();
  renderDueReview();
  if($('learningInsights').open&&homeView==='records'&&!$('setup').classList.contains('hide'))renderLearningInsights();
}
function learningGroupStats(questions){
  const scored=questions.filter(q=>!isNoAnswer(q));
  const done=scored.filter(q=>history[q.id]?.n>0&&typeof history[q.id].lastOk==='boolean');
  const correct=done.filter(q=>history[q.id].lastOk).length;
  const rate=done.length?correct/done.length:null;
  return {total:scored.length,done:done.length,correct,rate,
    mistakeReasons:mistakeReasonStats(scored.flatMap(q=>history[q.id]?.attempts||[])),
    attempts:done.reduce((n,q)=>n+history[q.id].n,0),correctAttempts:done.reduce((n,q)=>n+history[q.id].ok,0),
    state:done.length<5?'insufficient':rate<=.6?'weak':rate>=.8?'strong':'middle'};
}
function learningInsights(subject,level){
  const bookSubject=TEXTBOOK.subjects.find(s=>s.title===subject)?.id;
  const groups=(level==='topic'?TEXTBOOK.topics:TEXTBOOK.parents).filter(t=>t.subject===bookSubject);
  const topicParents=new Map(TEXTBOOK.topics.map(t=>[t.id,t.parentId]));
  return groups.map(group=>({group,...learningGroupStats(QUESTIONS.filter(q=>q.subject===subject&&
    (level==='topic'?q.topicId===group.id:topicParents.get(q.topicId)===group.id)))})).filter(row=>row.total)
    .sort((a,b)=>({weak:0,middle:1,strong:2,insufficient:3}[a.state]-{weak:0,middle:1,strong:2,insufficient:3}[b.state])||
      (a.rate??1)-(b.rate??1)||b.done-a.done||a.group.id.localeCompare(b.group.id));
}
function answerLog(subject,source){
  return [...QUESTIONS,...PREDICTIONS].filter(q=>q.subject===subject&&
    (source==='all'||(source==='prediction')===(q.kind==='prediction')))
    .flatMap(q=>(history[q.id]?.attempts||[]).map(attempt=>({q,...attempt})))
    .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
}
let answerLogLimit=50;
function renderLearningInsights(){
  const subject=$('analysisSubject').value||'基礎科目',level=$('analysisLevel').value||'parent';
  const host=$('learningInsightRows');host.replaceChildren();
  const labels={weak:'苦手',strong:'得意',middle:'学習中',insufficient:'判定用の解答が不足'};
  learningInsights(subject,level).forEach(row=>{
    const unit=document.createElement('div');unit.className='topicRow';
    const info=document.createElement('div');const title=document.createElement('strong');title.textContent=row.group.title;
    const badge=document.createElement('span');badge.className='learningBadge '+row.state;badge.textContent=labels[row.state];
    const meta=document.createElement('div');meta.className='meta';
    meta.textContent=`異なる問題 ${row.done}/${row.total}問・直近正答 ${row.correct}/${row.done}問（${row.rate===null?'—':Math.round(row.rate*100)+'%'}）・累計 ${row.correctAttempts}/${row.attempts}回正解`;
    info.append(title,badge,meta);
    if(row.mistakeReasons.total){const reasons=document.createElement('small');reasons.className='meta';
      reasons.textContent='日時履歴の誤答理由：'+Object.entries(row.mistakeReasons.counts).filter(([,n])=>n).map(([reason,n])=>`${reason} ${n}回`).join('／');info.appendChild(reasons);}
    const button=document.createElement('button');button.className='btn btn-ghost btn-sm';button.textContent='教科書で確認';
    button.addEventListener('click',()=>bookShow(row.group.subject,level==='topic'?row.group.parentId:row.group.id,level==='topic'?row.group.id:null));
    unit.append(info,button);host.appendChild(unit);
  });
  const logs=answerLog(subject,$('answerLogSource').value||'official'),logHost=$('answerLogRows');logHost.replaceChildren();
  $('answerLogSummary').textContent=`日時付きの解答記録 ${logs.length}件。以前の回数・直近の正誤は引き継ぎ、日時や選択肢が残っていない昔の解答は履歴として再作成しません。`;
  const mistakes=mistakeReasonStats(logs),summary=$('mistakeSummary');summary.replaceChildren();
  [...mistakeLabels(),'未選択'].forEach(reason=>{
    const row=document.createElement('div');row.className='line';
    row.textContent=`${reason}：${mistakes.counts[reason]}回`;summary.appendChild(row);
  });
  const note=document.createElement('p');note.className='meta';note.textContent=`選択中の科目・問題種別の日時付き誤答 ${mistakes.total}回を集計（再解答も1回ずつ）。上の分野・テーマ別集計は公式過去問のみ。`;summary.appendChild(note);
  logs.slice(0,answerLogLimit).forEach(entry=>{
    const row=document.createElement('div');row.className='answerLogRow';const title=document.createElement('strong');
    title.textContent=`${new Date(entry.at).toLocaleString('ja-JP')}｜${entry.q.year} ${entry.q.number}`;
    const detail=document.createElement('small');detail.className='meta';
    const answer=entry.answer===GIVEUP?'わからない':entry.answer?`元の${CIRCLE[entry.answer-1]||entry.answer}`:'記録なし';
    detail.textContent=`${entry.q.kind==='prediction'?'予想問題':'公式過去問'}・${{study:'学習',practice:'練習',exam:'模試'}[entry.mode]}・${entry.scored===false?'正答なし（採点対象外）':entry.ok?'正解':'不正解'}・選択 ${answer}`;
    const schedule=studyReviewSchedule(entry.q,history[entry.q.id]);if(schedule)detail.textContent+=`・次の復習 ${schedule.due}`;
    row.append(title,detail);
    if(entry.ok===false&&entry.scored!==false)row.appendChild(mistakeReasonControl(entry.q,entry,renderLearningInsights));
    logHost.appendChild(row);
  });
  if(!logs.length){const p=document.createElement('p');p.className='meta';p.textContent='この科目の日時付き解答記録はまだありません。';logHost.appendChild(p);}
  $('btnMoreAnswerLog').classList.toggle('hide',logs.length<=answerLogLimit);
}
['analysisSubject','analysisLevel','answerLogSource'].forEach(id=>$(id).addEventListener('change',()=>{answerLogLimit=50;renderLearningInsights();}));
$('btnMoreAnswerLog').addEventListener('click',()=>{answerLogLimit+=50;renderLearningInsights();});
/* 直近の正誤を問題ID単位で数える。繰り返し解いた回数で一つのテーマが過大評価されないようにする。 */
function recommendationCandidates(preferredSubjects=[]){
  const official=QUESTIONS.filter(q=>!isNoAnswer(q));
  const scope=$('homeSubject')?.value||'all';
  const stats=TEXTBOOK.topics.map(topic=>{
    const subject=TEXTBOOK.subjects.find(s=>s.id===topic.subject)?.title;
    const all=official.filter(q=>q.topicId===topic.id);
    const done=all.filter(q=>history[q.id]?.n>0&&typeof history[q.id].lastOk==='boolean');
    const wrong=done.filter(q=>history[q.id].lastOk===false).length;
    return {topic,subject,all,n:done.length,wrong,unseen:all.length-done.length,
      rate:done.length?(done.length-wrong)/done.length:null};
  }).filter(s=>s.all.length&&(scope==='all'||s.subject===scope));
  const unlearned=stats.filter(s=>!bookLearned.has(s.topic.id)&&s.n===0);
  const candidates=unlearned.length?unlearned:stats;
  return candidates.sort((a,b)=>
    (unlearned.length?0:(a.rate??1)-(b.rate??1)) ||
    Number(preferredSubjects.includes(b.subject))-Number(preferredSubjects.includes(a.subject)) ||
    b.unseen-a.unseen || a.topic.id.localeCompare(b.topic.id)).map(s=>({...s,kind:unlearned.length?'new':'review'}));
}
function buildRecommendation(preferredSubjects=[]){
  const picked=recommendationCandidates(preferredSubjects)[0];
  if(!picked) return null;
  const rank=q=>history[q.id]?.lastOk===false?0:history[q.id]?.n>0?2:1;
  return {...picked,questions:picked.all.slice().sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id)).slice(0,5)};
}
function renderRecommendation(hostId,preferredSubjects=[]){
  const host=$(hostId), rec=buildRecommendation(preferredSubjects);
  host.replaceChildren(); host.classList.toggle('hide',!rec);
  if(!rec) return;
  const title=document.createElement('h3'); title.textContent='今回のおすすめ';
  const topic=document.createElement('strong'); topic.textContent=`${rec.subject}｜${rec.topic.title}`;
  const reason=document.createElement('p');
  reason.textContent=rec.kind==='review'
    ? `未学習テーマがないため、直近正答率の低い順に表示しています（${rec.rate===null?'正答率未計測':Math.round(rec.rate*100)+'%'}）。`
    : `教科書の学習済みチェックがなく、対応する過去問も未実施のテーマです（${rec.unseen}問）。`;
  const actions=document.createElement('div'); actions.className='recommendationActions';
  const book=document.createElement('button'); book.className='btn btn-ghost btn-sm';
  book.textContent='教科書で確認';
  book.addEventListener('click',()=>bookShow(rec.topic.subject,rec.topic.parentId,rec.topic.id));
  const practice=document.createElement('button'); practice.className='btn btn-primary btn-sm';
  practice.textContent=`関連する過去問を${rec.questions.length}問解く`;
  practice.addEventListener('click',()=>startQuiz(rec.questions,'study'));
  actions.append(book,practice); host.append(title,topic,reason,actions);
  const next=recommendationCandidates(preferredSubjects).slice(1,5);
  if(next.length){
    const list=bookNode('ol','recommendationList');
    next.forEach(r=>list.appendChild(bookNode('li','',`${r.subject}｜${r.topic.title}${r.kind==='review'?`（${r.rate===null?'未計測':Math.round(r.rate*100)+'%'}）`:''}`)));
    host.appendChild(bookNode('p','meta','続いて学ぶテーマ'));host.appendChild(list);
  }
}
/* 出題頻度は公式過去問の主テーマで集計する。令和元年度の再試験は同じ年度にまとめる。 */
function frequencyYear(year){ return String(year||'').replace(/[（(]再試験[）)]$/,''); }
function frequencyYearOrder(year){
  const match=/^(令和|平成)(元|\d+)年度/.exec(year||'');
  return match?(match[1]==='令和'?2018:1988)+(match[2]==='元'?1:Number(match[2])):0;
}
function frequencyData(subject){
  const bookSubject=(TEXTBOOK.subjects||[]).find(s=>s.title===subject);
  const subjectQuestions=QUESTIONS.filter(q=>q.subject===subject);
  const years=[...new Set(subjectQuestions.map(q=>frequencyYear(q.year)))];
  const rows=(TEXTBOOK.topics||[]).filter(t=>t.subject===bookSubject?.id).map(topic=>{
    const questions=subjectQuestions.filter(q=>q.topicId===topic.id);
    const hitYears=[...new Set(questions.map(q=>frequencyYear(q.year)))].sort((a,b)=>frequencyYearOrder(b)-frequencyYearOrder(a));
    return {topic,questions,hitYears};
  }).filter(row=>row.questions.length);
  rows.sort((a,b)=>b.hitYears.length-a.hitYears.length || b.questions.length-a.questions.length || a.topic.title.localeCompare(b.topic.title,'ja'));
  return {years,rows};
}
function frequencyBandFor(row,total){
  if(row.hitYears.length===total) return 'every';
  const interval=total/row.hitYears.length;
  return interval>=1.75&&interval<=2.25?'about2':'other';
}
let frequencyVisible=25;
function renderFrequency(){
  const subject=$('frequencySubject').value;
  const {years,rows}=frequencyData(subject);
  const total=years.length, band=$('frequencyBand').value;
  $('frequencyIntro').textContent=`公式過去問の全${total}年度を主テーマで集計。同じ年度の複数問と令和元年度再試験は1年度として数えます。「約2年に1回」は年度数からの換算で、出題の周期を示すものではありません。テーマ対応は一部確認中です。`;
  const filtered=rows.filter(row=>band==='all'||frequencyBandFor(row,total)===band);
  $('frequencySummary').textContent=`${filtered.length}テーマを表示対象にしています（過去問がある全${rows.length}テーマ）。`;
  const host=$('frequencyTopics'); host.replaceChildren();
  filtered.slice(0,frequencyVisible).forEach(row=>{
    const line=document.createElement('div'); line.className='frequencyRow';
    const info=document.createElement('div');
    const name=document.createElement('strong'); name.textContent=row.topic.title;
    const parent=(TEXTBOOK.parents||[]).find(p=>p.id===row.topic.parentId);
    const group=document.createElement('div'); group.className='meta'; group.textContent=parent?.title||subject;
    const badge=document.createElement('span'); badge.className='frequencyBadge';
    const bucket=frequencyBandFor(row,total);
    badge.textContent=bucket==='every'?'毎年':bucket==='about2'?'約2年に1回':`換算：約${(total/row.hitYears.length).toFixed(1)}年に1回`;
    const done=row.questions.filter(q=>history[q.id]).length;
    const counts=document.createElement('div'); counts.className='meta';
    counts.textContent=`出題 ${row.hitYears.length}/${total}年度・過去問 ${row.questions.length}問・実施 ${done}問`;
    const yearsBox=document.createElement('details'); yearsBox.className='frequencyYears';
    const yearsSummary=document.createElement('summary'); yearsSummary.textContent='出題年度を見る';
    const yearList=document.createElement('div'); yearList.textContent=row.hitYears.join('・');
    yearsBox.append(yearsSummary,yearList);
    info.append(name,group,badge,counts,yearsBox);
    const actions=document.createElement('div'); actions.className='recommendationActions';
    const book=document.createElement('button'); book.type='button'; book.className='btn btn-ghost btn-sm';
    book.textContent='教科書で学ぶ';
    book.addEventListener('click',()=>bookShow(row.topic.subject,row.topic.parentId,row.topic.id));
    const practiceQuestions=row.questions.filter(q=>!isNoAnswer(q)).sort((a,b)=>{
      const rank=q=>history[q.id]?.lastOk===false?0:history[q.id]?2:1;
      return rank(a)-rank(b) || frequencyYearOrder(b.year)-frequencyYearOrder(a.year) || a.id.localeCompare(b.id);
    }).slice(0,5);
    const practice=document.createElement('button'); practice.type='button'; practice.className='btn btn-primary btn-sm';
    practice.textContent=practiceQuestions.length?`過去問を${practiceQuestions.length}問解く`:'正答のある過去問なし';
    practice.disabled=practiceQuestions.length===0;
    practice.addEventListener('click',()=>startQuiz(practiceQuestions,'study'));
    actions.append(book,practice); line.append(info,actions); host.appendChild(line);
  });
  const more=$('frequencyMore');
  more.classList.toggle('hide',filtered.length<=frequencyVisible);
  more.textContent=`さらに表示（残り${Math.max(0,filtered.length-frequencyVisible)}テーマ）`;
}
SUBJECT_ORDER.forEach(subject=>$('frequencySubject').add(new Option(subject,subject)));
$('frequencySubject').value='専門科目(建設部門)';
['frequencySubject','frequencyBand'].forEach(id=>$(id).addEventListener('change',()=>{
  frequencyVisible=25; renderFrequency();
}));
$('frequencyCard').addEventListener('toggle',()=>{ if($('frequencyCard').open) renderFrequency(); });
$('frequencyMore').addEventListener('click',()=>{ frequencyVisible+=25; renderFrequency(); });
const SEARCH_QUESTIONS=[...QUESTIONS,...PREDICTIONS];
function initSearch(){
  const year=$('searchYear'), subject=$('searchSubject');
  year.add(new Option('すべての年度',''));
  uniq(SEARCH_QUESTIONS.map(q=>q.year)).forEach(y=>year.add(new Option(y,y)));
  subject.add(new Option('すべての科目',''));
  subjects.forEach(s=>subject.add(new Option(s,s)));
  [$('searchText'),year,subject].forEach(el=>el.addEventListener('input',renderSearch));
}
function renderSearch(){
  const term=$('searchText').value.trim().toLocaleLowerCase('ja');
  const year=$('searchYear').value, subject=$('searchSubject').value;
  const host=$('searchResults'); host.replaceChildren();
  if(!term && !year && !subject){ $('searchCount').textContent='語句を入力するか、年度・科目を選んでください。'; return; }
  const hits=SEARCH_QUESTIONS.filter(q=>(!year||q.year===year)&&(!subject||q.subject===subject)&&
    (!term||[q.question,...q.choices,q.number,q.field||'',q.theme||'',...(q.basics||[])].join(' ').toLocaleLowerCase('ja').includes(term)));
  $('searchCount').textContent=`${hits.length}問見つかりました${hits.length>50?'（先頭50問を表示）':''}`;
  hits.slice(0,50).forEach(q=>{
    const card=document.createElement('div'); card.className='hitCard';
    const title=document.createElement('div'); title.className='meta';
    title.textContent=`${q.year}　${q.subject}　${q.number}　${q.field||q.theme||''}`;
    const question=document.createElement('div'); question.className='qt';
    question.textContent=q.question.slice(0,180)+(q.question.length>180?'…':'');
    const button=document.createElement('button'); button.className='btn btn-ghost btn-sm';
    button.textContent='この問題を解く'; button.style.marginTop='8px';
    button.addEventListener('click',()=>startQuiz([q],'study'));
    card.append(title,question,button); host.appendChild(card);
  });
}
initSearch(); renderSearch();

/* 2文字シェイングル（バイグラム）によるゆるい類似検索。日本語は分かち書きがないため、
   形態素解析なしでも実用的な簡易類似度としてバイグラムのDice係数を用いる。 */
function bigramMultiset(s){
  const m = new Map();
  const t = (s||'').replace(/\s+/g,'');
  for(let i=0;i<t.length-1;i++){
    const g = t.slice(i,i+2);
    m.set(g, (m.get(g)||0)+1);
  }
  return m;
}
function diceScore(qGrams, textGrams){
  if(qGrams.size===0 || textGrams.size===0) return 0;
  let inter = 0, qn=0, tn=0;
  qGrams.forEach((c,g)=>{ qn+=c; if(textGrams.has(g)) inter += Math.min(c, textGrams.get(g)); });
  textGrams.forEach(c=>{ tn+=c; });
  return (2*inter) / (qn+tn);
}
/* 検索対象テキストのバイグラムは初回のみ計算してキャッシュする */
let SEARCH_INDEX = null;
function buildSearchIndex(){
  if(SEARCH_INDEX) return SEARCH_INDEX;
  SEARCH_INDEX = QUESTIONS.map(q=>({
    q,
    grams: bigramMultiset([q.question, (q.choices||[]).join(' '), q.explanation||'', q.groupName||''].join(' '))
  }));
  return SEARCH_INDEX;
}
function findRelated(query, n, excludeId){
  const qGrams = bigramMultiset(query);
  const idx = buildSearchIndex();
  const scored = idx.map(e=>({q:e.q, s:diceScore(qGrams, e.grams)}))
    .filter(e=>e.s>0 && e.q.id!==excludeId)
    .sort((a,b)=>b.s-a.s);
  return scored.slice(0, n).map(e=>e.q);
}
function renderHits(hits, hostId){
  const host = $(hostId);
  if(!hits.length){ host.innerHTML = '<div class="meta">関連する他の過去問は見つかりませんでした。</div>'; return; }
  host.innerHTML = '';
  hits.forEach(q=>{
    const d = document.createElement('div');
    d.className = 'hitCard';
    d.innerHTML = `<div class="hd">
        <span><span class="tag">${q.year}</span><span class="tag sub">${q.number}</span></span>
        <button class="btn btn-ghost btn-sm" type="button">この問題を解く</button>
      </div>
      <div class="qt"></div>`;
    d.querySelector('.qt').textContent = q.question.length>160 ? q.question.slice(0,160)+'…' : q.question;
    d.querySelector('button').addEventListener('click', ()=>insertQuestion(q));
    host.appendChild(d);
  });
}
function renderKaisetsu(kk, q){
  const host = $('praRefContent');
  host.innerHTML = '';
  if(kk){
    const d = document.createElement('div');
    d.className = 'hitCard';
    d.innerHTML = `<div class="hd"><span class="tag sub"></span><span class="tag"></span></div>
      <div class="qnum" style="font-size:.95rem;margin:4px 0 8px"></div>
      <div class="qt"></div>
      <ul style="margin:10px 0 0;padding-left:18px;font-size:.85rem"></ul>`;
    d.querySelector('.tag.sub').textContent = kk.groupName || '';
    d.querySelector('.hd .tag:not(.sub)').textContent = kk.frequency || '';
    d.querySelector('.qnum').textContent = kk.themeName || '';
    d.querySelector('.qt').textContent = kk.explanation || '';
    const ul = d.querySelector('ul');
    (kk.keyPoints||[]).forEach(k=>{ const li=document.createElement('li'); li.textContent=k; ul.appendChild(li); });
    if(!(kk.keyPoints||[]).length) ul.remove();
    host.appendChild(d);
  }else{
    const note = q.subject==='専門科目(建設部門)'
      ? 'この問題に対応する解説書データはまだ見つかりませんでした（建設部門の専門科目は解説書の整備がまだ一部の年度・分野に限られています）。'
      : 'この問題に対応する解説書データはまだ見つかりませんでした。';
    const div = document.createElement('div');
    div.className = 'meta';
    div.textContent = note;
    host.appendChild(div);
  }
}
/* ---------- 出題 ---------- */
let S = null; // session state
const SESSION_KEY='gijutsushi_session_v1';
const QUESTION_BY_ID=new Map([...QUESTIONS,...PREDICTIONS].map(q=>[q.id,q]));
let savedSession=null;
try{ savedSession=JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); }catch(e){}
function hasPastWrongAnswer(q){
  const h=history[q.id];
  return !!h&&Number.isFinite(h.n)&&h.n>0&&h.n>(Number.isFinite(h.ok)?h.ok:0);
}
function choiceContent(q,index){
  return q.choices[index].replace(/^\s*[①-⑩]\s+/, '');
}
function choiceShuffleSupported(q){
  return !isNoAnswer(q)&&q.choices.length>1&&q.choices.every((_,i)=>
    !/[①-⑩]|選択肢\s*[1-9１-９]/.test(choiceContent(q,i)));
}
function shuffledChoiceOrder(q){
  const original=q.choices.map((_,index)=>index);
  // Every choice moves, including the correct one, so its old position cannot be reused.
  for(let attempt=0;attempt<16;attempt++){
    const order=shuffled(original);
    if(order.every((index,i)=>index!==i)) return order;
  }
  return original.slice(1).concat(original[0]);
}
function sessionChoiceOrder(index){
  const q=S.list[index];
  if(!S.choiceOrders) S.choiceOrders=S.list.map(()=>null);
  if(!S.choiceOrders[index]) S.choiceOrders[index]=
    S.shuffleChoices&&hasPastWrongAnswer(q)&&choiceShuffleSupported(q)
      ?shuffledChoiceOrder(q):q.choices.map((_,i)=>i);
  return S.choiceOrders[index];
}
function choicesWereShuffled(index){
  return !!S.choiceOrders?.[index]?.some((value,i)=>value!==i);
}
function displayedChoiceNumber(index,originalNumber){
  if(!originalNumber) return originalNumber;
  const order=S.choiceOrders?.[index];
  return order?order.indexOf(originalNumber-1)+1:originalNumber;
}
function displayedChoiceLabel(index,originalNumber){
  const number=displayedChoiceNumber(index,originalNumber);
  return CIRCLE[number-1]||String(number);
}
function chooseDisplayed(number){
  if(!S||!Number.isInteger(number)||number<1) return;
  if((S.mode==='study'||S.mode==='practice')&&S.ans[S.i]!==null) return;
  const order=sessionChoiceOrder(S.i);
  if(number>order.length) return;
  choose(order[number-1]+1);
}
function validSavedChoiceOrders(d){
  // Sessions from before this setting always retain the original choice order.
  if(d.choiceOrders===undefined&&d.shuffleChoices===undefined) return true;
  return typeof d.shuffleChoices==='boolean'&&Array.isArray(d.choiceOrders)&&d.choiceOrders.length===d.list.length&&
    d.choiceOrders.every((order,i)=>(order===null&&(!d.shuffleChoices||d.ans?.[i]===null))||(Array.isArray(order)&&
      order.length===QUESTION_BY_ID.get(d.list[i]).choices.length&&new Set(order).size===order.length&&
      order.every(value=>Number.isInteger(value)&&value>=0&&value<order.length)));
}
function elapsedMs(){ return S ? (S.elapsedMs||0)+(S.activeFrom?Date.now()-S.activeFrom:0) : 0; }
function formatElapsed(ms){
  const seconds=Math.max(0,Math.floor(ms/1000));
  return `${Math.floor(seconds/3600)?Math.floor(seconds/3600)+':':''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function saveSession(){
  if(!S || $('quiz').classList.contains('hide')) return;
  savedSession={version:1, mode:S.mode, list:S.list.map(q=>q.id), i:S.i,
    ans:S.ans, shown:S.shown, attemptIds:S.attemptIds, elapsedMs:elapsedMs(), savedAt:Date.now(),
    shuffleChoices:S.shuffleChoices===true, choiceOrders:S.list.map((_,i)=>S.choiceOrders?.[i]?.slice()||null),
    textbookTopicId:S.textbookTopicId||null, textbookScroll:S.textbookScroll||0};
  if(S.mode==='practice') Object.assign(savedSession,{
    queue:S.queue.map(q=>q.id), qi:S.qi, served:[...S.served],
    insertQueue:S.insertQueue.map(q=>q.id), insertRun:S.insertRun,
    limit:S.limit, reviewMode:S.reviewMode, round:S.round, reason:S.reason
  });
  try{ localStorage.setItem(SESSION_KEY,JSON.stringify(savedSession)); }catch(e){}
  renderResumeCard();
}
function clearSession(){
  savedSession=null;
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  renderResumeCard();
}
function validSavedSession(d){
  return d && d.version===1 && ['study','exam','practice'].includes(d.mode) &&
    Array.isArray(d.list) && d.list.length>0 && d.list.every(id=>QUESTION_BY_ID.has(id)) &&
    validSavedChoiceOrders(d) &&
    Array.isArray(d.ans) && d.ans.length===d.list.length &&
    Array.isArray(d.shown) && d.shown.length===d.list.length &&
    (d.attemptIds===undefined||(Array.isArray(d.attemptIds)&&d.attemptIds.length===d.list.length&&d.attemptIds.every(id=>id===null||typeof id==='string'))) &&
    d.ans.every((a,i)=>a===null||(Number.isInteger(a)&&a>=0&&a<=QUESTION_BY_ID.get(d.list[i]).choices.length)) &&
    Number.isInteger(d.i)&&d.i>=0&&d.i<d.list.length &&
    (d.mode!=='practice'||(Array.isArray(d.queue)&&d.queue.every(id=>QUESTION_BY_ID.has(id))&&
      Array.isArray(d.insertQueue)&&d.insertQueue.every(id=>QUESTION_BY_ID.has(id))&&
      Array.isArray(d.served)&&d.served.every(id=>QUESTION_BY_ID.has(id))&&
      Number.isInteger(d.qi)&&d.qi>=0&&d.qi<=d.queue.length));
}
function renderResumeCard(){
  const card=$('resumeCard');
  if(!validSavedSession(savedSession)){ card.classList.add('hide'); return; }
  card.classList.remove('hide');
  const answered=savedSession.ans.filter(a=>a!==null).length;
  const label={study:'学習',exam:'模試',practice:'練習'}[savedSession.mode];
  $('resumeInfo').textContent=`${label}モード・${savedSession.i+1}問目／${savedSession.list.length}問・解答済み${answered}問・経過${formatElapsed(savedSession.elapsedMs||0)}`;
}
function resumeSession(){
  const d=savedSession;
  if(!validSavedSession(d)){ clearSession(); alert('保存した出題を復元できませんでした。'); return; }
  S={list:d.list.map(id=>QUESTION_BY_ID.get(id)),mode:d.mode,i:d.i,ans:d.ans.slice(),
    shown:d.shown.slice(),attemptIds:d.list.map((_,i)=>typeof d.attemptIds?.[i]==='string'?d.attemptIds[i]:null),insertQueue:[],insertRun:0,elapsedMs:Math.max(0,d.elapsedMs||0),activeFrom:Date.now(),
    shuffleChoices:d.shuffleChoices===true, choiceOrders:d.list.map((_,i)=>d.choiceOrders?.[i]?.slice()||null),
    textbookTopicId:TEXTBOOK.topics?.some(t=>t.id===d.textbookTopicId)?d.textbookTopicId:null,
    textbookScroll:d.textbookScroll||0};
  if(d.mode==='practice') Object.assign(S,{
    queue:d.queue.map(id=>QUESTION_BY_ID.get(id)),poolIds:new Set(d.queue),qi:d.qi,
    served:new Set(d.served),insertQueue:d.insertQueue.map(id=>QUESTION_BY_ID.get(id)),
    insertRun:d.insertRun||0,limit:d.limit||0,reviewMode:!!d.reviewMode,
    round:d.round||1,reason:d.reason||''
  });
  $('setup').classList.add('hide'); $('textbook').classList.add('hide'); $('result').classList.add('hide'); $('quiz').classList.remove('hide');
  syncChrome();
  renderQ(); window.scrollTo(0,0);
}
$('btnResume').addEventListener('click',resumeSession);
$('btnDiscardSession').addEventListener('click',()=>{
  if(!confirm('途中の出題を破棄します。すでに保存された解答履歴は残ります。')) return;
  S=null; clearSession();
});
window.addEventListener('pagehide',saveSession);
setInterval(()=>{
  if(S&&!$('quiz').classList.contains('hide')){
    $('qElapsed').textContent=formatElapsed(elapsedMs());
  }
},1000);
setInterval(saveSession,5000);
function startQuiz(list, mode, opt){
  if($('quiz').classList.contains('hide') && validSavedSession(savedSession) &&
     !confirm('途中保存中の出題があります。新しい出題を始めると、その続きは上書きされます。開始しますか？')) return;
  opt = opt || {};
  S = {list, mode, i:0, ans:new Array(list.length).fill(null), shown:new Array(list.length).fill(false), attemptIds:new Array(list.length).fill(null),
       insertQueue:[], insertRun:0, elapsedMs:0, activeFrom:Date.now(),
       shuffleChoices:$('chkShuffleChoices').checked, choiceOrders:list.map(()=>null),
       textbookTopicId:opt.textbookTopicId||null, textbookScroll:opt.textbookScroll||0};
  if(mode==='practice'){
    /* 練習モードは「基本キュー」を出題順どおりに1問ずつ消化していく。
       list には1問目だけを入れ、queue の2問目以降を順に足していく。 */
    S.queue = opt.queue || list.slice();
    S.poolIds = new Set(S.queue.map(q=>q.id)); // 自動の類似問題も設定した出題範囲から選ぶ
    S.qi = list.length;                       // 基本キューの次に出す位置
    S.served = new Set(list.map(q=>q.id));
    S.limit = opt.limit || 0;                 // 0 = 上限なし
    S.reviewMode = false;
    S.round = 1;
    S.reason = `出題順どおりに出題しています（${S.qi}/${S.queue.length}問目）。`;
  }
  $('setup').classList.add('hide'); $('textbook').classList.add('hide'); $('result').classList.add('hide'); $('quiz').classList.remove('hide');
  syncChrome();
  renderQ(); window.scrollTo(0,0);
}

/* ---------- 練習モードの出題エンジン ---------- */
const simText = q => [q.question, (q.choices||[]).join(' '), q.explanation||''].join(' ');

/* 出題済みの各問題について「最後に解答したときの正誤」を見て、間違ったままの問題を返す */
function stillMissed(){
  const last = {};
  S.list.forEach((q,i)=>{ if(S.ans[i]!==null) last[q.id] = {q, ok: isNoAnswer(q) || judge(q,S.ans[i])}; });
  return Object.values(last).filter(e=>!e.ok).map(e=>e.q);
}

function practiceDone(msg){ alert(msg); finish(); }

/* 基本キュー（または復習キュー）から次の1問を取り出す。
   出し切っていたら復習周に入る。もう出す問題がなければ null を返して集計へ。 */
function nextFromQueue(){
  while(S.qi < S.queue.length){
    const q = S.queue[S.qi++];
    if(S.reviewMode || !S.served.has(q.id)) return q;
  }
  const miss = stillMissed();
  if(!miss.length){
    practiceDone(S.reviewMode
      ? '対象の問題をすべて出題し、間違えた問題もすべて解き直しました。お見事です。'
      : '対象の問題をすべて出題しました。全問正解です。');
    return null;
  }
  S.reviewMode = true;
  S.round++;
  S.queue = miss;
  S.qi = 1;
  return miss[0];
}

/* 練習モード：次の1問を出題する */
function practiceNext(){
  if(S.limit>0 && S.list.length >= S.limit){
    practiceDone(`設定した出題数（${S.limit}問）に達しました。ここまでを採点します。`); return;
  }
  const cur = S.list[S.i], a = S.ans[S.i];
  let nxt = null, reason = '', isInsert = false;

  /* 1) 「この問題を解く」で指定された問題があれば最優先で割り込む */
  if(S.insertQueue.length){
    nxt = S.insertQueue.shift(); isInsert = true;
    reason = '選んだ問題を割り込みで出題しています。';
  }
  /* 2) 直前が誤答なら、設定した出題範囲内の類似問題を割り込む（連続2問まで） */
  if(!nxt && !S.reviewMode && a!==null && !isNoAnswer(cur) && !judge(cur,a) && S.insertRun < 2){
    const cands = findRelated(simText(cur), 60, cur.id).filter(x=>S.poolIds.has(x.id) && !S.served.has(x.id));
    if(cands.length){
      nxt = cands[0]; isInsert = true;
      reason = `直前の問題を間違えたので、類似問題を出題しています（連続${S.insertRun+1}問目・最大2問）。`;
    }
  }

  if(isInsert){
    S.insertRun++;
  }else{
    S.insertRun = 0;
    nxt = nextFromQueue();
    if(!nxt) return;                       // nextFromQueue が集計まで済ませた
    reason = S.reviewMode
      ? `復習${S.round-1}周目：間違えた問題を解き直しています（${S.qi}/${S.queue.length}問目）。`
      : `出題順どおりに出題しています（${S.qi}/${S.queue.length}問目）。`;
  }
  S.served.add(nxt.id);
  S.list.push(nxt); S.ans.push(null); S.shown.push(false); (S.attemptIds ||= []).push(null);
  S.choiceOrders?.push(null);
  S.i = S.list.length-1;
  S.reason = reason;
  renderQ(); window.scrollTo(0,0);
}

/* 「この問題を解く」：セッションを作り直さず、今の出題に割り込ませる */
function insertQuestion(q){
  if(!S || $('quiz').classList.contains('hide')){ startQuiz([q], 'study'); return; }
  if(S.mode==='practice'){
    S.insertQueue.push(q);
    saveSession();
    if(S.ans[S.i]!==null){ practiceNext(); }
    else{ alert('今の問題に解答して「次の問題」を押すと、この問題を出題します。'); }
    return;
  }
  /* 学習・模試モードは今の問題の直後に差し込む */
  S.list.splice(S.i+1, 0, q); S.ans.splice(S.i+1, 0, null); S.shown.splice(S.i+1, 0, false); (S.attemptIds ||= []).splice(S.i+1, 0, null);
  S.choiceOrders?.splice(S.i+1,0,null);
  S.i = S.i + 1;
  renderQ(); window.scrollTo(0,0);
}
function curAnswered(){ return S.ans[S.i]!==null; }
function isNoAnswer(q){ return q.answer===null || q.answer===undefined; }

function renderQ(){
  const q = S.list[S.i], picked = S.ans[S.i];
  const choiceOrder=sessionChoiceOrder(S.i), choicesShuffled=choicesWereShuffled(S.i);
  const reveal = (S.mode==='study' || S.mode==='practice') && picked!==null;

  const practice = S.mode==='practice';
  $('qPos').textContent = S.i+1;
  $('qTotal').textContent = practice ? (S.limit>0 ? S.limit : '—') : S.list.length;
  const answered = S.ans.filter(a=>a!==null).length;
  const okCount = S.list.reduce((n,qq,i)=> n + (effectiveOk(qq,S.ans[i]) ? 1:0), 0);
  $('qAns').textContent = answered;
  $('qOk').textContent  = S.mode==='exam' ? '—' : okCount;
  $('qRate').textContent = S.mode==='exam' ? '採点は終了後' : (answered ? `正答率 ${Math.round(okCount/answered*100)}%` : '');
  $('qBar').style.width = practice
    ? Math.round(100 * (S.limit>0 ? S.list.length/S.limit : S.qi/Math.max(S.queue.length,1)))+'%'
    : Math.round((S.i+1)/S.list.length*100)+'%';
  $('praHint').textContent = practice ? (S.reason||'') : '';

  $('qYear').textContent = q.year;
  $('qSubj').textContent = q.subject;
  if(q.group){ $('qGroup').textContent = groupLabel(q.group); $('qGroup').classList.remove('hide'); }
  else if(q.field){ $('qGroup').textContent = q.field; $('qGroup').classList.remove('hide'); }
  else $('qGroup').classList.add('hide');

  $('qNumber').textContent = `問題 ${q.number}`;
  $('qElapsed').textContent=formatElapsed(elapsedMs());
  $('btnUnsure').textContent=unsure.has(q.id)?'★ 自信なし（解除する）':'☆ 自信なしにする';
  $('btnUnsure').setAttribute('aria-pressed',unsure.has(q.id)?'true':'false');
  /* 手書きメモをこの問題のものに差し替える（メモ機能の定義は下部） */
  if(typeof memoSetKey === 'function') memoSetKey(q.id, `${q.year} ${q.number} のメモ`);
  $('qText').textContent = q.question;

  const fig = FIGURES[q.id];
  if(fig){
    $('qFigImg').src = fig;
    $('qFigImg').alt = q.note || ('問題 '+q.number+' の図表');
    $('qFigCap').textContent = q.kind==='prediction'
      ? '図表（予想問題用に作成。公式の試験問題ではありません）　クリックで拡大'
      : '図表（日本技術士会 公開の試験問題PDFより）　クリックで拡大';
    $('qFig').classList.remove('hide');
  } else $('qFig').classList.add('hide');

  const host = $('qChoices'); host.innerHTML='';
  const shuffleSkipped=S.shuffleChoices&&hasPastWrongAnswer(q)&&!isNoAnswer(q)&&!choiceShuffleSupported(q);
  $('qChoiceNotice').textContent=choicesShuffled?'選択肢をシャッフルしています。':shuffleSkipped?'選択肢の中に番号参照があるため、この問題は元の並びで出題しています。':'';
  $('qChoiceNotice').classList.toggle('hide',!choicesShuffled&&!shuffleSkipped);
  choiceOrder.forEach((originalIndex,idx)=>{
    const n = originalIndex+1;
    const c=choicesShuffled?choiceContent(q,originalIndex):q.choices[originalIndex];
    const b = document.createElement('button');
    b.type='button'; b.className='choice';
    b.setAttribute('role','radio');
    b.setAttribute('aria-checked', picked===n ? 'true' : 'false');
    if(picked===n) b.classList.add('picked');
    if(reveal){
      b.classList.add('locked');
      b.disabled = true;
      const isRight = !isNoAnswer(q) && (n===q.answer || (q.alt&&q.alt.indexOf(n)>=0));
      if(isRight) b.classList.add('correct');
      if(picked===n && !isNoAnswer(q) && !isRight) b.classList.add('wrong');
    }
    b.innerHTML = `<span class="no">${CIRCLE[idx]||n}</span><span class="txt"></span>`;
    b.querySelector('.txt').textContent = c;
    if(reveal&&choicesShuffled){
      const original=document.createElement('small'); original.className='choiceOriginal';
      original.textContent=`元の問題では ${CIRCLE[originalIndex]||n}`; b.querySelector('.txt').appendChild(original);
    }
    if(!reveal) b.addEventListener('click', ()=>chooseDisplayed(idx+1));
    host.appendChild(b);
  });

  const V=$('qVerdict'), E=$('qExplain'), N=$('qNote');
  if(reveal){
    const ok = judge(q,picked);
    V.className='verdict ' + (isNoAnswer(q) ? 'na' : ok ? 'ok':'ng');
    const altTxt = q.alt ? `（${q.alt.map(a=>displayedChoiceLabel(S.i,a)).join('・')} も正答扱い）` : '';
    const mine = picked===GIVEUP ? '「わからない」' : displayedChoiceLabel(S.i,picked);
    V.textContent = isNoAnswer(q)
      ? '★ この問題は正答なし（受験者全員に得点）として扱われた問題です。'
      : ok ? `◯ 正解！　正答は ${displayedChoiceLabel(S.i,q.answer)}${altTxt}`
           : `✕ 不正解　あなたの解答 ${mine} ／ 正答は ${displayedChoiceLabel(S.i,q.answer)}${altTxt}`;
    V.classList.remove('hide');
    E.className='explain';
    E.innerHTML = `<div class="ttl">解説</div><div class="body"></div>`;
    E.querySelector('.body').textContent = q.explanation || '（解説なし）';
    const explainFigs = explanationFigureBlock(q, !isNoAnswer(q) && !judge(q,picked));
    if(explainFigs) E.appendChild(explainFigs);
    if(choicesShuffled){
      const notice=document.createElement('p'); notice.className='choiceShuffleNotice';
      notice.textContent='選択肢をシャッフルしています。解説・図表中の選択肢番号は元の問題の番号です。各選択肢の「元の問題では」の番号と照合してください。';
      E.insertBefore(notice,E.querySelector('.body'));
    }
    if(q.referenceUrl){
      const ref=document.createElement('div');
      ref.className='meta'; ref.style.marginTop='10px';
      const a=document.createElement('a');
      a.href=q.referenceUrl; a.target='_blank'; a.rel='noopener noreferrer';
      a.textContent='参考資料：'+(q.referenceTitle||'一次資料');
      ref.appendChild(a); E.appendChild(ref);
    }
    E.classList.remove('hide');
  }else{
    V.classList.add('hide'); E.classList.add('hide');
  }
  if(q.note){
    N.className='note';
    N.innerHTML = `<div class="ttl">補足（図表・訂正など）</div><div></div>`;
    N.querySelector('div:last-child').textContent = q.note;
    N.classList.remove('hide');
  }else N.classList.add('hide');

  /* 「わからない（解説を見る）」は未解答かつ模試モード以外のときだけ出す */
  $('qGiveUpRow').classList.toggle('hide', picked!==null || S.mode==='exam');

  /* 学習・練習では全問の基礎知識を参照できる。誤答したときは自動で開く。 */
  const wrongAnswer = reveal && !isNoAnswer(q) && !judge(q,picked);
  const reasonHost=$('qMistakeReason');reasonHost.replaceChildren();
  const attempt=history[q.id]?.attempts?.find(a=>a.id===S.attemptIds?.[S.i]);
  reasonHost.classList.toggle('hide',!wrongAnswer||!attempt);
  if(wrongAnswer&&attempt)reasonHost.appendChild(mistakeReasonControl(q,attempt,()=>{}));
  const comparisons=reveal?comparisonCardsFor(q):[];
  $('qComparison').classList.toggle('hide',!comparisons.length);
  renderComparisonCards($('qComparisonCards'),comparisons);
  const textbookTarget=textbookTargetForWrongAnswer(q,picked,S.mode);
  $('qTextbookAction').classList.toggle('hide',!textbookTarget);
  if(textbookTarget){
    $('btnQuestionTextbook').textContent=textbookTarget.topicId?'この問題の教科書テーマを開く':'関連する教科書を開く';
    $('qTextbookHint').textContent=`${textbookTarget.title}を開きます。読んだあと、この問題に戻れます。`;
  }
  const basicsBox = $('qBasicsBox');
  basicsBox.classList.toggle('hide', S.mode==='exam');
  basicsBox.open = wrongAnswer;
  const basicsList = $('qBasicsList');
  basicsList.replaceChildren();
  (q.basics || []).forEach(entry=>{
    const li = document.createElement('li');
    li.textContent = entry;
    basicsList.appendChild(li);
  });

  const wrongInPractice = wrongAnswer && S.mode==='practice';
  if(wrongInPractice){
    $('praSimBox').classList.remove('hide');
    const simHits = findRelated([q.question,(q.choices||[]).join(' '),q.explanation||''].join(' '), 3, q.id);
    renderHits(simHits, 'praSimHits');
    $('praRefBox').classList.remove('hide');
    renderKaisetsu(KAISETSU[q.year+'||'+q.number], q);
  }else{
    $('praSimBox').classList.add('hide');
    $('praRefBox').classList.add('hide');
  }

  $('btnPrev').disabled = S.i===0;
  $('btnNext').textContent = practice ? '次の問題' : (S.i===S.list.length-1 ? '採点する' : '次の問題');
  $('btnFinish').textContent = practice ? 'ここまでで採点する（練習を終える）' : 'ここまでで採点する';
  renderGrid();
  saveSession();
}
$('btnUnsure').addEventListener('click',()=>{
  if(!S) return;
  const id=S.list[S.i].id;
  if(unsure.has(id)) unsure.delete(id); else unsure.add(id);
  saveUnsure(); renderQ();
});

function judge(q, picked){
  if(isNoAnswer(q)) return true;                       // 全員正解扱い
  if(q.alt && q.alt.indexOf(picked)>=0) return true;   // 複数正答扱いの問題
  return picked===q.answer;
}
/* 正答なし（全員正解）の問題は、未回答でも正解扱いにする（結果画面の「★全員正解」表示と一致させる）。
   それ以外は回答済みかつ judge() が真のときだけ正解扱い。 */
function effectiveOk(q, a){
  if(isNoAnswer(q)) return true;
  return a!==null && judge(q,a);
}
function choose(n){
  S.ans[S.i]=n;
  const q=S.list[S.i];
  if(S.mode==='study' || S.mode==='practice'){
    if(!S.shown[S.i]){ S.shown[S.i]=true; (S.attemptIds ||= [])[S.i]=record(q.id, judge(q,n),{answer:n,mode:S.mode}); }
    renderQ();
  }else{
    renderQ();
    /* 選択時点の問題位置を固定して比較する。160ms以内にグリッド操作等で別の問題へ
       移動していた場合は、そちらを勝手に1問進めてしまわないよう何もしない。 */
    const idx = S.i;
    setTimeout(()=>{ if(S.i===idx && S.i<S.list.length-1){S.i++;renderQ();window.scrollTo(0,0);} },160);
  }
}
function renderGrid(){
  const g=$('qGrid'); g.innerHTML='';
  S.list.forEach((q,i)=>{
    const b=document.createElement('button');
    b.textContent = i+1;
    const a = S.ans[i];
    if(a!==null){
      if(S.mode==='study' || S.mode==='practice') b.classList.add(judge(q,a)?'ok':'ng');
      else b.classList.add('done');
    }
    if(i===S.i) b.classList.add('now');
    b.title = q.number;
    b.addEventListener('click', ()=>{S.i=i;renderQ();window.scrollTo(0,0);});
    g.appendChild(b);
  });
}
$('btnPrev').addEventListener('click', ()=>{ if(S.i>0){S.i--;renderQ();window.scrollTo(0,0);} });
$('btnNext').addEventListener('click', ()=>{
  if(S.i<S.list.length-1){S.i++;renderQ();window.scrollTo(0,0);return;}
  if(S.mode==='practice'){ practiceNext(); return; }
  finish();
});
$('btnFinish').addEventListener('click', finish);
/* わからないときは、間違えたときと同じ扱い（不正解として記録し、正答・解説・基礎知識を表示） */
$('btnGiveUp').addEventListener('click', ()=>{
  if(!S || S.ans[S.i]!==null || S.mode==='exam') return;
  choose(GIVEUP);
});

/* ---------- 結果 ---------- */
function finish(){
  if(S.activeFrom){ S.elapsedMs=elapsedMs(); S.activeFrom=null; }
  if(S.mode==='exam'){
    S.list.forEach((q,i)=>{ if(S.ans[i]!==null && !S.shown[i]){ S.shown[i]=true; (S.attemptIds ||= [])[i]=record(q.id, judge(q,S.ans[i]),{answer:S.ans[i],mode:S.mode}); } });
  }
  const answered = S.ans.filter(a=>a!==null).length;
  const ok = S.list.reduce((n,q,i)=> n + (effectiveOk(q,S.ans[i]) ? 1:0), 0);
  const total = S.list.length;
  const predictionExam = S.mode==='exam' && S.list.every(q=>q.kind==='prediction');
  const weight = q => q.subject==='専門科目(建設部門)' ? 2 : 1;
  const possible = predictionExam ? S.list.reduce((n,q)=>n+weight(q),0) : total;
  const earned = predictionExam
    ? S.list.reduce((n,q,i)=>n+(effectiveOk(q,S.ans[i])?weight(q):0),0)
    : ok;
  const pct = possible ? Math.round(earned/possible*100) : 0;

  $('rScore').innerHTML = `
    <div class="box ${pct>=PASS_RATIO*100?'pass':'fail'}"><div class="v">${pct}%</div><div class="l">${predictionExam?`練習得点率（${earned}/${possible}点）`:'得点率'}</div></div>
    <div class="box"><div class="v">${ok}</div><div class="l">正解数</div></div>
    <div class="box"><div class="v">${total-ok}</div><div class="l">不正解・未解答</div></div>
    <div class="box"><div class="v">${answered}/${total}</div><div class="l">解答数</div></div>`;

  const bySubj = {};
  S.list.forEach((q,i)=>{
    const s = bySubj[q.subject] || (bySubj[q.subject]={n:0,ok:0});
    s.n++; if(effectiveOk(q,S.ans[i])) s.ok++;
  });
  const lines = Object.entries(bySubj).map(([s,v])=>{
    const p = Math.round(v.ok/v.n*100);
    const pass = p>=PASS_RATIO*100;
    return `<div class="line"><span>${s}</span><span><b>${v.ok}/${v.n}</b>（${p}%）　<b style="color:${pass?'var(--ok)':'var(--ng)'}">${pass?'基準以上':'基準未満'}</b></span></div>`;
  }).join('');
  const passNote = S.list.some(q=>q.kind==='prediction')
    ? '<div class="line" style="color:var(--sub);font-size:.8rem"><span>※ 非公式の予想問題です。成績は練習用で、公式試験の得点や合否を示すものではありません。</span><span></span></div>'
    : S.mode==='practice'
    ? '<div class="line" style="color:var(--sub);font-size:.8rem"><span>※ 練習モードの集計です。出題数は科目ごとに偏るため、合否の目安にはなりません。</span><span></span></div>'
    : '<div class="line" style="color:var(--sub);font-size:.8rem"><span>※ 本試験の合格基準は各科目とも満点の50%以上です（全科目で基準を満たす必要があります）。</span><span></span></div>';
  /* 今回の出題分だけのジャンル別成績。学習履歴からのおすすめとは区別する。 */
  const byGenre = {};
  S.list.forEach((q,i)=>{
    const k = (q.subject==='適性科目' ? (q.theme||q.genre) : (q.field||q.genre)) || '（分類なし）';
    const g = byGenre[k] || (byGenre[k]={n:0, ok:0, subject:q.subject});
    g.n++; if(effectiveOk(q,S.ans[i])) g.ok++;
  });
  const gLines = Object.entries(byGenre)
    .map(([k,v])=>({k, v, p: v.ok/v.n}))
    .sort((a,b)=> a.p-b.p || b.v.n-a.v.n)
    .map(({k,v,p})=>{
      const pct = Math.round(p*100);
      const col = pct>=70 ? 'var(--ok)' : pct>=50 ? 'var(--warn)' : 'var(--ng)';
      return `<div class="line"><span>${k}<span style="color:var(--sub);font-size:.78rem">　${v.subject}</span></span>`+
             `<span><b>${v.ok}/${v.n}</b>　<b style="color:${col}">${pct}%</b></span></div>`;
    }).join('');
  $('rPass').innerHTML = `<div class="stats">${lines}${passNote}</div>`+
    `<h3>今回のジャンル別成績（正答率の低い順）</h3><div class="stats">${gLines}</div>`;
  renderRecommendation('resultRecommendation',S.list.filter((q,i)=>q.kind!=='prediction'&&S.ans[i]!==null).map(q=>q.subject));

  let rows = `<tr><th>No</th><th>問題</th><th>科目</th><th class="c">解答</th><th class="c">正答</th><th class="c">判定</th></tr>`;
  S.list.forEach((q,i)=>{
    const a=S.ans[i], ok2 = effectiveOk(q,a);
    const na = isNoAnswer(q);
    rows += `<tr class="${ok2?'':'miss'}">
      <td class="c">${i+1}</td><td>${q.number}</td><td>${q.subject}</td>
      <td class="c">${a===GIVEUP?'わからない':(a?displayedChoiceLabel(i,a):'—')}</td>
      <td class="c">${na?'なし':displayedChoiceLabel(i,q.answer)}${choicesWereShuffled(i)?`<small class="choiceOriginal">元 ${CIRCLE[q.answer-1]}</small>`:''}</td>
      <td class="c">${na?'★全員正解':ok2?'◯':'✕'}</td></tr>`;
  });
  $('rTable').innerHTML = rows;
  const reasons=$('rMistakeReasons');reasons.replaceChildren();
  S.list.forEach((q,i)=>{
    const attempt=history[q.id]?.attempts?.find(a=>a.id===S.attemptIds?.[i]);
    if(!attempt||attempt.ok!==false||attempt.scored===false)return;
    const row=document.createElement('div');row.className='answerLogRow';
    const title=document.createElement('strong');title.textContent=`${i+1}問目｜${q.year} ${q.number}`;
    row.append(title,mistakeReasonControl(q,attempt,renderStats));reasons.appendChild(row);
  });
  $('rMistakeSection').classList.toggle('hide',!reasons.children.length);

  $('quiz').classList.add('hide'); $('setup').classList.add('hide'); $('result').classList.remove('hide');
  syncChrome();
  clearSession();
  window.scrollTo(0,0);
  renderStats();
}
$('btnReview').addEventListener('click', ()=>{
  const miss = S.list.filter((q,i)=> !effectiveOk(q,S.ans[i]) );
  if(!miss.length){ alert('間違えた問題はありません。お見事です。'); return; }
  startQuiz(miss, 'study');
});
$('btnAgain').addEventListener('click', toSetup);
function pickPredictionExam(){
  const kiso = PREDICTIONS.filter(q=>q.subject==='基礎科目');
  const tekisei = PREDICTIONS.filter(q=>q.subject==='適性科目');
  const kensetsu = PREDICTIONS.filter(q=>q.subject==='専門科目(建設部門)');
  const chosen = [];
  for(let group=1;group<=5;group++){
    chosen.push(...shuffled(kiso.filter(q=>q.group===`${group}群`)).slice(0,3));
  }
  chosen.push(...tekisei, ...shuffled(kensetsu).slice(0,25));
  if(chosen.length!==55) throw new Error(`予想模試の出題数が不正です: ${chosen.length}`);
  return chosen;
}
$('btnPredExam').addEventListener('click', ()=>startQuiz(pickPredictionExam(), 'exam'));
$('btnPredStudy').addEventListener('click', ()=>startQuiz(PREDICTIONS.slice(), 'study'));
[['btnPredKiso','基礎科目'],['btnPredTekisei','適性科目'],['btnPredKensetsu','専門科目(建設部門)']]
  .forEach(([id,subject])=>$(id).addEventListener('click', ()=>startQuiz(PREDICTIONS.filter(q=>
    q.subject===subject &&
    (subject!=='適性科目' || sel.aptitudeTopics.has(aptitudeTopic(q))) &&
    (subject!=='専門科目(建設部門)' || sel.fields.has(q.field))
  ), 'study')));
$('btnHome').addEventListener('click', ()=>{
  toSetup();
});
function toSetup(){
  if(S&&!$('quiz').classList.contains('hide')){
    saveSession(); S.elapsedMs=elapsedMs(); S.activeFrom=null;
  }
  if(S) S.bookVisit=false;
  $('quiz').classList.add('hide'); $('result').classList.add('hide'); $('textbook').classList.add('hide'); $('setup').classList.remove('hide');
  syncChrome();
  refreshSetup(); window.scrollTo(0,0);
}
$('btnStart').addEventListener('click', ()=>{
  const list = pickQuestions();
  if(!list.length){ alert('条件に合う問題がありません。設定を見直してください。'); return; }
  const mode = curMode();
  if(mode==='practice'){
    /* 練習モードは1問目だけ出して、以降は基本キューから1問ずつ累積していく */
    startQuiz([list[0]], mode, {queue:list, limit:parseInt($('selCount').value,10)||0});
  }else{
    startQuiz(list, mode);
  }
});
$('btnSetupDefault').addEventListener('click',()=>{
  sel.years=new Set([years[0]]); sel.subjects=new Set(subjects); sel.groups=new Set(groups);
  sel.aptitudeTopics=new Set(aptitudeTopics); sel.fields=new Set(fields);
  buildChips($('yearChips'),years,sel.years);
  buildChips($('subjChips'),subjects,sel.subjects);
  buildChips($('groupChips'),groups,sel.groups,groupLabel);
  buildChips($('aptitudeMajorChips'),aptitudeMajor,sel.aptitudeTopics,aptitudeLabel);
  buildChips($('aptitudeOtherChips'),['その他'],sel.aptitudeTopics,aptitudeLabel);
  buildChips($('fieldChips'),fields,sel.fields);
  $('selOrder').value='seq'; $('selFilter').value='all'; $('selCount').value='0';
  $('chkShuffleChoices').checked=true; $('chipShuffleChoices').classList.add('on');
  document.querySelector('input[name=qtype][value=all]').checked=true;
  document.querySelector('input[name=mode][value=study]').checked=true;
  refreshSetup();
});
/* 学習記録の持ち運び。 */
function exportRecord(){
  const data={app:'gijutsushi-kakomon',version:7,exportedAt:new Date().toISOString(),history,unsure:[...unsure],bookLearned:[...bookLearned]};
  if($('chkMemo').checked){ memoFlush(); data.memos=memos; }
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  const name=`kakomon_record_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}.json`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}));
  a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
function importRecord(file){
  if(file.size>20*1024*1024){ alert('20MBを超える記録は読み込めません。'); return; }
  const fr=new FileReader();
  fr.onload=()=>{
    let obj;
    try{ obj=JSON.parse(fr.result); }catch(e){ alert('JSONとして読み込めませんでした。'); return; }
    const source=obj&&obj.history&&typeof obj.history==='object' ? obj.history : obj;
    if(!source || typeof source!=='object' || Array.isArray(source)){
      alert('学習記録の形式ではありません。'); return;
    }
    const ids=new Set([...QUESTIONS,...PREDICTIONS].map(q=>q.id));
    let nHist=0,nMemo=0,nSkippedMemo=0,nUnsure=0,nLearned=0;
    if(Array.isArray(obj.bookLearned)){
      obj.bookLearned.forEach(id=>{
        if(TEXTBOOK.topics.some(t=>t.id===id)&&!bookLearned.has(id)){bookLearned.add(id);nLearned++;}
      });
      saveBookLearned();
    }
    for(const id of Object.keys(source)){
      const v=source[id];
      if(!ids.has(id) || !v || typeof v!=='object' || !Number.isFinite(v.n) || v.n<0) continue;
      const cur=history[id];
      history[id]=mergeStudyRecord(id,cur,v);nHist++;
    }
    if(Array.isArray(obj.unsure)){
      obj.unsure.forEach(id=>{ if(ids.has(id)&&!unsure.has(id)){ unsure.add(id); nUnsure++; } });
      saveUnsure();
    }
    if(obj.memos && typeof obj.memos==='object'){
      memoFlush();
      for(const id of Object.keys(obj.memos)){
        const d=obj.memos[id];
        if(!ids.has(id) && id!=='general') continue;
        if(d && Array.isArray(d.s) && (d.v===2 || d.v===3 || (Number.isFinite(d.p) && d.p>=1)) &&
           d.s.every(st=>Array.isArray(st) && Number.isInteger(st[0]) && Number.isInteger(st[1]) &&
             Array.isArray(st[2]) && st[2].length>=2 && st[2].length%2===0 &&
             st[2].every(Number.isFinite))){
          memos[id]=memoNormalize(d); nMemo++;
        }else{ nSkippedMemo++; }
      }
      try{ localStorage.setItem(MEMO_STORE,JSON.stringify(memos)); }catch(e){}
      memoLoadCurrent();
    }
    if(!nHist && !nMemo && !nUnsure && !nLearned){
      alert('取り込める記録が見つかりませんでした。');
      return;
    }
    saveHistory(); refreshSetup();
    alert(`読み込みました：学習済み ${nLearned} テーマ、解答記録 ${nHist} 問、自信なし ${nUnsure} 問、手書きメモ ${nMemo} 件`+
      (nSkippedMemo?`。形式が不正なメモ ${nSkippedMemo} 件は対象外です。`:''));
  };
  fr.readAsText(file,'utf-8');
}
$('btnExport').addEventListener('click',exportRecord);
$('btnImport').addEventListener('click',()=>$('fileImport').click());
$('fileImport').addEventListener('change',e=>{
  const file=e.target.files&&e.target.files[0];
  if(file) importRecord(file);
  e.target.value='';
});
$('btnReset').addEventListener('click', ()=>{
  if(!confirm('学習の記録をすべて削除します。よろしいですか？')) return;
  history={}; unsure=new Set(); bookLearned.clear(); saveBookLearned(); saveHistory(); saveUnsure(); clearSession(); refreshSetup();
});

/* ---------- 図表の拡大表示 ---------- */
$('qFigImg').addEventListener('click', ()=>openZoom($('qFigImg').src, $('qFigImg').alt));
/* 解説の図・表・グラフ。不正解のときは開いた状態、正解のときは折りたたんで出す。 */
function explanationFigureBlock(q, open){
  const list = EXPLAIN_FIGS[q.id] || [];
  if(!list.length) return null;
  const box = document.createElement('details');
  box.className = 'explainFigs'; box.open = open;
  const sum = document.createElement('summary');
  sum.textContent = `図解で確認する（${list.length}点）`;
  box.appendChild(sum);
  list.forEach(f=>{
    const fig = document.createElement('figure'); fig.className = 'explainFig';
    const img = document.createElement('img');
    img.src = f.src; img.alt = f.alt || ''; img.loading = 'lazy'; img.decoding = 'async';
    img.title = 'クリックで拡大';
    img.addEventListener('click', ()=>openZoom(img.src, img.alt));
    fig.appendChild(img);
    if(f.caption){ const cap = document.createElement('figcaption'); cap.textContent = f.caption; fig.appendChild(cap); }
    box.appendChild(fig);
  });
  return box;
}
function openZoom(src, alt){
  const ov=document.createElement('div');
  ov.id='zoomOv';
  ov.innerHTML='<img><div class="tip">画像をクリック、または Esc キーで閉じます</div>';
  ov.querySelector('img').src=src;
  ov.querySelector('img').alt=alt||'';
  const close=()=>{ ov.remove(); document.removeEventListener('keydown',esc); };
  const esc=e=>{ if(e.key==='Escape') close(); };
  ov.addEventListener('click',close);
  document.addEventListener('keydown',esc);
  document.body.appendChild(ov);
}

/* 問題文・選択肢・解説の文字サイズ。設定は端末内に保存する。 */
const FS_STEPS=[0.85,1,1.15,1.3,1.5,1.75,2];
const FS_KEY='gijutsushi_fs_v1';
let fsIdx=1;
try{ const i=FS_STEPS.indexOf(parseFloat(localStorage.getItem(FS_KEY))); if(i>=0) fsIdx=i; }catch(e){}
function applyFs(){
  document.documentElement.style.setProperty('--qs',FS_STEPS[fsIdx]);
  $('fsLabel').textContent=Math.round(FS_STEPS[fsIdx]*100)+'%';
  $('btnFsDn').disabled=fsIdx===0; $('btnFsUp').disabled=fsIdx===FS_STEPS.length-1;
  try{ localStorage.setItem(FS_KEY,String(FS_STEPS[fsIdx])); }catch(e){}
}
$('btnFsDn').addEventListener('click',()=>{ if(fsIdx>0){fsIdx--;applyFs();} });
$('btnFsUp').addEventListener('click',()=>{ if(fsIdx<FS_STEPS.length-1){fsIdx++;applyFs();} });
applyFs();

/* ---------- 教科書 ---------- */
const BOOK_LEARNED_KEY='gijutsushi_book_learned_v1';
let bookLearned=new Set();
try{
  const saved=JSON.parse(localStorage.getItem(BOOK_LEARNED_KEY)||'[]');
  if(Array.isArray(saved)) bookLearned=new Set(saved.filter(id=>TEXTBOOK.topics.some(t=>t.id===id)));
}catch(e){}
function saveBookLearned(){
  try{localStorage.setItem(BOOK_LEARNED_KEY,JSON.stringify([...bookLearned]));}catch(e){}
}
function bookLearnedSummary(topics){
  return `学習済み ${topics.filter(t=>bookLearned.has(t.id)).length} / ${topics.length}テーマ`;
}
function bookLearnedControl(topic){
  const label=bookNode('label','bookLearned');
  const input=bookNode('input'); input.type='checkbox'; input.checked=bookLearned.has(topic.id);
  input.dataset.learnedTopic=topic.id;
  input.addEventListener('change',()=>{
    if(input.checked) bookLearned.add(topic.id); else bookLearned.delete(topic.id);
    saveBookLearned();
    renderBookLearningChart();
    document.querySelectorAll('[data-learned-topic]').forEach(el=>{
      if(el.dataset.learnedTopic===topic.id) el.checked=input.checked;
    });
  });
  label.append(input,document.createTextNode('このテーマを学習済みにする'));
  return label;
}

const BOOK_TOPIC_BY_ID=new Map((TEXTBOOK.topics||[]).map(t=>[t.id,t]));
const BOOK_PARENT_BY_ID=new Map((TEXTBOOK.parents||[]).map(p=>[p.id,p]));
$('homeTopicCount').textContent=`${BOOK_TOPIC_BY_ID.size}テーマ`;
let bookState={subject:null,parentId:null,topicId:null,scroll:0};
function textbookTargetForQuestion(q){
  const topic=BOOK_TOPIC_BY_ID.get(q.topicId||TEXTBOOK.mapping?.[q.id]?.primary);
  if(topic) return {subject:topic.subject,parentId:topic.parentId,topicId:topic.id,title:topic.title};
  const subject=(TEXTBOOK.subjects||[]).find(s=>s.title===q.subject);
  if(!subject) return null;
  let parent=null;
  if(subject.id==='kiso'&&q.group){
    const number=/^\d+/.exec(q.group)?.[0];
    parent=BOOK_PARENT_BY_ID.get(`kiso-${number}`)||null;
  }else if(subject.id==='kensetsu'&&q.field){
    parent=(TEXTBOOK.parents||[]).find(p=>p.subject===subject.id&&p.title===q.field)||null;
  }
  return {subject:subject.id,parentId:parent?.id||null,topicId:null,title:parent?.title||subject.title};
}
function textbookTargetForWrongAnswer(q,answer,mode){
  if(!['study','practice'].includes(mode)||answer===null||isNoAnswer(q)||judge(q,answer)) return null;
  return textbookTargetForQuestion(q);
}
function openQuestionTextbook(){
  if(!S||$('quiz').classList.contains('hide')) return;
  const q=S.list[S.i], answer=S.ans[S.i];
  const target=textbookTargetForWrongAnswer(q,answer,S.mode);
  if(!target) return;
  saveSession();
  S.elapsedMs=elapsedMs(); S.activeFrom=null;
  S.bookVisit=true; S.bookVisitScroll=window.scrollY;
  bookShow(target.subject,target.parentId,target.topicId);
}
function returnFromTextbookToQuiz(){
  if(!S?.bookVisit) return;
  const scroll=S.bookVisitScroll||0;
  S.bookVisit=false; S.activeFrom=Date.now();
  $('textbook').classList.add('hide'); $('setup').classList.add('hide');
  $('result').classList.add('hide'); $('quiz').classList.remove('hide');
  renderQ(); syncChrome();
  requestAnimationFrame(()=>window.scrollTo(0,scroll));
}
$('btnQuestionTextbook').addEventListener('click',openQuestionTextbook);
$('btnReturnToQuiz').addEventListener('click',returnFromTextbookToQuiz);
function bookNode(tag,cls,label){
  const e=document.createElement(tag);
  if(cls) e.className=cls;
  if(label!==undefined) e.textContent=label;
  return e;
}
function bookButton(label,action,cls='bookTile'){
  const b=bookNode('button',cls,label);
  b.type='button'; b.addEventListener('click',action); return b;
}
function bookQuestions(topicId){
  if(bookQuestions.source!==QUESTIONS){
    const index=new Map();QUESTIONS.forEach(q=>{
      new Set([q.topicId,...(q.relatedTopicIds||[])]).forEach(id=>{if(!index.has(id))index.set(id,[]);index.get(id).push(q);});
    });bookQuestions.source=QUESTIONS;bookQuestions.index=index;
  }
  return (bookQuestions.index.get(topicId)||[]).slice();
}
function bookJumpToQuestions(){
  const heading=$('bookQuestionsHeading');
  if(!heading) return;
  heading.scrollIntoView({behavior:'smooth',block:'start'});
  heading.focus({preventScroll:true});
}
function bookFormulaStages(section,topicId,sectionIndex){
  const guide=TEXTBOOK.formulaGuides?.[`${topicId}:${sectionIndex}`];
  const stages=[];
  const add=(title,body)=>{if(body?.trim()) stages.push({title,body});};
  const firstSentence=(section.paragraphs?.[0]||'').split('。')[0];
  add('何を求めるか',guide?.purpose||firstSentence+(firstSentence?'。':''));
  if(guide?.symbols?.length) add('記号の意味',guide.symbols.map(s=>`・${s}`).join('\n'));
  if(guide?.why?.length) guide.why.forEach((s,i)=>add(`式が成り立つ理由 ${i+1}`,s));
  else if(section.paragraphs?.[1]) add('考え方・条件',section.paragraphs[1]);
  section.formula.split('\n').map(s=>s.trim()).filter(Boolean).forEach((s,i)=>add(`公式 ${i+1}`,s));
  if(guide?.units) add('単位を確かめる',guide.units);
  else{
    const unitSentence=(section.paragraphs||[]).join('。').split('。').find(s=>s.includes('単位'));
    if(unitSentence) add('単位を確かめる',unitSentence+'。');
  }
  const example=section.steps?.length?section.steps:guide?.example||[];
  example.forEach((s,i)=>add(`例題 ${i+1}/${example.length}`,s));
  if(!example.length) add('問題で確かめる','このテーマに対応する過去問を下の一覧から選び、式の使い方を確かめましょう。');
  return stages;
}
function bookFormulaGuide(section,topicId,sectionIndex){
  const stages=bookFormulaStages(section,topicId,sectionIndex);
  const details=bookNode('details','bookFormulaGuide');
  details.appendChild(bookNode('summary','',`公式を一段ずつ理解する（${stages.length}段階）`));
  const body=bookNode('div','bookFormulaGuideBody');
  const progress=bookNode('p','bookFormulaGuideProgress');
  const title=bookNode('div','bookFormulaGuideTitle');
  const explanation=bookNode('div','bookFormulaGuideText'); explanation.setAttribute('aria-live','polite');
  const nav=bookNode('div','bookFormulaGuideNav');
  let index=0;
  const previous=bookButton('前へ',()=>{index--;render();},'btn btn-ghost btn-sm');
  const next=bookButton('次へ',()=>{index++;render();},'btn btn-primary btn-sm');
  const questions=bookButton('このテーマの全過去問へ',bookJumpToQuestions,'btn btn-ghost btn-sm');
  const render=()=>{
    const stage=stages[index];
    progress.textContent=`${index+1} / ${stages.length}`;
    title.textContent=stage.title; explanation.textContent=stage.body;
    previous.disabled=index===0; next.classList.toggle('hide',index===stages.length-1);
    questions.classList.toggle('hide',index!==stages.length-1||!bookQuestions(topicId).length);
  };
  nav.append(previous,next,questions); body.append(progress,title,explanation,nav); details.appendChild(body);
  render(); return details;
}
function bookWorkedExamples(topicId,variants=false){
  const examples=(variants?TEXTBOOK.calculationPractice:TEXTBOOK.workedExamples)?.[topicId]||[];
  if(!examples.length) return null;
  const headingId=variants?'bookCalculationHeading':'bookExamplesHeading';
  const host=bookNode('section','bookExamples'); host.setAttribute('aria-labelledby',headingId);
  const heading=bookNode('h3','',`${variants?'数字を変えて練習':'例題で確かめる'}（${examples.length}題）`);
  heading.id=headingId; heading.tabIndex=-1;
  host.appendChild(heading);
  host.appendChild(bookNode('p','meta',variants?'同じ計算形式で数値を変えた学習用の練習問題です。公式過去問の成績には入りません。まず自分で計算してから解き方を確認してください。':'学習用の例題です。まず自分で考えてから「解き方と答え」を開いてください。数値や条件は例題用に設定しています。'));
  examples.forEach((example,i)=>{
    const card=bookNode('div','bookExample');
    const prompt=bookNode('div','bookExamplePrompt');
    prompt.appendChild(bookNode('h4','',`例題${i+1}：${example.title}`));
    prompt.appendChild(bookNode('p','',example.question));
    const solution=bookNode('details','bookExampleSolution');
    solution.appendChild(bookNode('summary','',`例題${i+1}の解き方と答え`));
    const body=bookNode('div','bookExampleSolutionBody');
    body.appendChild(bookNode('strong','','考え方'));
    body.appendChild(bookNode('p','',example.approach));
    body.appendChild(bookNode('div','bookFormula',example.formula));
    if(example.image){
      const fig=bookNode('figure','bookFigure');
      const img=bookNode('img'); img.src=bookImageSource(example.image); img.alt=example.image.alt;img.loading='lazy';img.decoding='async';
      fig.appendChild(img);
      if(example.image.caption) fig.appendChild(bookNode('figcaption','',example.image.caption));
      body.appendChild(fig);
    }
    const steps=bookNode('ol','bookSteps');
    example.steps.forEach(step=>steps.appendChild(bookNode('li','',step)));
    body.appendChild(steps);
    const answer=bookNode('div','bookExampleAnswer');
    answer.appendChild(bookNode('strong','','答え'));
    answer.appendChild(bookNode('p','',example.answer)); body.appendChild(answer);
    const check=bookNode('div','bookExampleCheck');
    check.appendChild(bookNode('strong','','確かめ方・注意点'));
    check.appendChild(bookNode('p','',example.check)); body.appendChild(check);
    (example.references||[]).forEach(ref=>{
      const p=bookNode('p','meta'); const link=bookNode('a','',ref.title);
      link.href=ref.url; link.target='_blank'; link.rel='noopener noreferrer';
      p.appendChild(link); body.appendChild(p);
    });
    solution.appendChild(body); card.append(prompt,solution); host.appendChild(card);
  });
  return host;
}
function bookShow(subject=null,parentId=null,topicId=null,scroll=0){
  if(topicId && !BOOK_TOPIC_BY_ID.has(topicId)) return;
  bookState={subject,parentId,topicId,scroll};
  $('setup').classList.add('hide'); $('quiz').classList.add('hide');
  $('result').classList.add('hide'); $('textbook').classList.remove('hide');
  renderBook(); syncChrome();
  requestAnimationFrame(()=>window.scrollTo(0,scroll));
}
function bookCrumbs(){
  const host=$('bookCrumbs'); host.replaceChildren();
  const parts=[['教科書',()=>bookShow()]];
  const subject=(TEXTBOOK.subjects||[]).find(s=>s.id===bookState.subject);
  const parent=BOOK_PARENT_BY_ID.get(bookState.parentId);
  const topic=BOOK_TOPIC_BY_ID.get(bookState.topicId);
  if(subject) parts.push([subject.title,()=>bookShow(subject.id)]);
  if(parent) parts.push([parent.title,()=>bookShow(subject.id,parent.id)]);
  if(topic) parts.push([topic.title,null]);
  parts.forEach(([label,action],i)=>{
    if(i) host.appendChild(bookNode('span','', '›'));
    if(action) host.appendChild(bookButton(label,action,'bookCrumb'));
    else host.appendChild(bookNode('span','',label));
  });
}
function bookCard(title,detail,action,topics=[]){
  const b=bookButton('',action);
  b.appendChild(bookNode('strong','',title));
  b.appendChild(bookNode('small','',detail));
  if(topics.length){
    const learned=bookLearningSummary(topics),ids=new Set(topics.map(t=>t.id));
    const qs=QUESTIONS.filter(q=>ids.has(q.topicId)),stats=learningGroupStats(qs);
    b.appendChild(chartRow('教科書',learned.done,learned.total,`${learned.done} / ${learned.total}テーマ学習済み`));
    const answered=qs.filter(bookQuestionAnswered).length;
    b.appendChild(chartRow('過去問',answered,qs.length,qs.length?`${answered} / ${qs.length}問実施`:'0 / 0問・過去問なし'));
    b.appendChild(chartRow('直近正答率',stats.correct,stats.done,stats.rate===null?'未計測':`${Math.round(stats.rate*100)}%（${stats.correct}/${stats.done}問）`,'var(--ok)'));
  }
  return b;
}
function bookStatus(q){
  if(q.answer==null) return '公式に正答なし';
  const h=history[q.id];
  return !bookQuestionAnswered(q)?'未実施':h.lastOk===true?'前回正解':h.lastOk===false?'前回不正解':'実施済み';
}
function bookQuestionAnswered(q){
  return (history[q.id]?.n||0)>0;
}
function bookPracticeQuestions(topicId,filter='all',count=null){
  const questions=bookQuestions(topicId);
  if(filter==='all') return questions;
  if(filter==='wrong') return questions.filter(q=>bookQuestionAnswered(q)&&history[q.id].lastOk===false);
  if(filter==='unseen') return questions.filter(q=>!bookQuestionAnswered(q));
  if(filter==='due') return dueReviewQuestions(topicId);
  if(filter==='random'){
    if(!Number.isInteger(count)||count<1||count>questions.length) return [];
    return shuffled(questions).slice(0,count);
  }
  return [];
}
function bookStartPractice(topicId,filter,count=null){
  const list=bookPracticeQuestions(topicId,filter,count);
  if(!list.length) return;
  startQuiz(list,'study',{textbookTopicId:topicId,textbookScroll:window.scrollY});
}
function bookStudyActions(topicId){
  const host=bookNode('div','bookStudyActions');
  host.appendChild(bookNode('p','meta','全収録年度の主テーマ・関連テーマの過去問が対象です。「間違えた問題」は直近の解答が不正解の問題です。'));
  const buttons=bookNode('div','bookStudyButtons');
  const options=[['all','すべて解く'],['wrong','間違えた問題だけ解く'],['unseen','まだ解いていない問題を解く'],['due','復習日が来た問題を解く']];
  options.forEach(([filter,label])=>{
    const n=bookPracticeQuestions(topicId,filter).length;
    const button=bookButton(`${label}（${n}問）`,()=>bookStartPractice(topicId,filter),
      `btn ${filter==='all'?'btn-primary':'btn-ghost'} btn-sm`);
    button.disabled=n===0; buttons.appendChild(button);
  });
  host.appendChild(buttons);
  const total=bookQuestions(topicId).length;
  const form=bookNode('form','bookRandomStudy');
  const label=bookNode('label','','ランダム'); label.htmlFor='bookRandomCount';
  const count=bookNode('input'); count.id='bookRandomCount'; count.type='number'; count.inputMode='numeric';
  count.min='1'; count.max=String(Math.max(1,total)); count.step='1'; count.required=true;
  count.value=String(Math.min(5,total)||1); count.disabled=total===0;
  count.setAttribute('aria-label',total?`ランダムに解く問題数（1〜${total}問）`:'ランダムに解く問題数（過去問0問）');
  count.addEventListener('input',()=>count.setCustomValidity(''));
  const button=bookNode('button','btn btn-primary btn-sm','ランダムで解く');
  button.type='submit'; button.disabled=total===0;
  form.append(label,count,bookNode('span','','問'),button);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!total) return;
    const value=Number(count.value);
    count.setCustomValidity(Number.isInteger(value)&&value>=1&&value<=total?'':`1〜${total}の整数を入力してください。`);
    if(!count.reportValidity()) return;
    bookStartPractice(topicId,'random',value);
  });
  host.appendChild(form); return host;
}
function renderBook(){
  bookCrumbs();
  renderBookLearningChart();
  $('comparisonSection').classList.toggle('hide',!!bookState.topicId);
  const host=$('bookContent'); host.replaceChildren();
  const topic=BOOK_TOPIC_BY_ID.get(bookState.topicId);
  const parent=BOOK_PARENT_BY_ID.get(bookState.parentId);
  if(topic){
    const article=bookNode('article','card bookArticle');
    article.appendChild(bookNode('h2','',topic.title));
    article.appendChild(bookLearnedControl(topic));
    const body=TEXTBOOK.content?.[topic.id];
    if(body?.editorialStatus==='source-summary') article.appendChild(bookNode('p','meta',TEXTBOOK.workedExamples?.[topic.id]?.length?'要点ノートに計算・手順の例題を追加しています。':'要点ノート：公式や例題の詳しい説明は順次追加します。'));
    if(body?.intro) article.appendChild(bookNode('p','',body.intro));
    if(body?.prerequisites?.length){
      const pre=bookNode('div','bookEmpty','先に読む：');
      body.prerequisites.forEach(id=>{
        const t=BOOK_TOPIC_BY_ID.get(id);
        if(t) pre.appendChild(bookButton(t.title,()=>bookShow(t.subject,t.parentId,t.id),'btn btn-ghost btn-sm'));
      });
      article.appendChild(pre);
    }
    if(body?.sections?.length){
      const allQuestions=bookQuestions(topic.id);
      const nav=bookNode('nav','bookCrumbs'); nav.setAttribute('aria-label','このテーマの目次');
      body.sections.forEach((section,i)=>{
        const heading=bookNode('h3','',section.title); heading.id=`book-section-${i}`;
        nav.appendChild(bookButton(section.title,()=>heading.scrollIntoView({behavior:'smooth'}),'btn btn-ghost btn-sm'));
        article.appendChild(heading);
        section.paragraphs.forEach(p=>article.appendChild(bookNode('p','',p)));
        if(section.table?.rows?.length){
          const wrap=bookNode('div','bookTableWrap'); wrap.setAttribute('role','region'); wrap.tabIndex=0;
          const table=bookNode('table','bookTable');
          if(section.table.caption){ table.appendChild(bookNode('caption','',section.table.caption)); wrap.setAttribute('aria-label',section.table.caption); }
          if(section.table.headers?.length){
            const tr=bookNode('tr'); section.table.headers.forEach(h=>{const th=bookNode('th','',h); th.scope='col'; tr.appendChild(th);});
            const thead=bookNode('thead'); thead.appendChild(tr); table.appendChild(thead);
          }
          const tbody=bookNode('tbody');
          section.table.rows.forEach(r=>{const tr=bookNode('tr'); r.forEach((c,j)=>{const cell=bookNode(j===0&&section.table.rowHeaders?'th':'td','',c); if(cell.tagName==='TH') cell.scope='row'; tr.appendChild(cell);}); tbody.appendChild(tr);});
          table.appendChild(tbody); wrap.appendChild(table); article.appendChild(wrap);
        }
        if(section.formula){
          article.appendChild(bookNode('div','bookFormula',section.formula));
          article.appendChild(bookFormulaGuide(section,topic.id,i));
        }else if(section.steps?.length){
          const ol=bookNode('ol','bookSteps');
          section.steps.forEach(s=>ol.appendChild(bookNode('li','',s)));
          article.appendChild(ol);
        }
        if(section.image){
          const fig=bookNode('figure','bookFigure');
          const img=bookNode('img'); img.src=bookImageSource(section.image); img.alt=section.image.alt;img.loading='lazy';img.decoding='async';
          fig.appendChild(img);
          if(section.image.caption) fig.appendChild(bookNode('figcaption','',section.image.caption));
          article.appendChild(fig);
        }
        if(allQuestions.length) article.appendChild(bookButton(`このテーマの全過去問を見る（${allQuestions.length}問）`,bookJumpToQuestions,'btn btn-ghost btn-sm bookSectionQuestions'));
      });
      const navIndex=3+(body?.editorialStatus==='source-summary'?1:0)+(body?.intro?1:0);
      if(allQuestions.length) nav.appendChild(bookButton(`過去問を解く（${allQuestions.length}問）`,bookJumpToQuestions,'btn btn-ghost btn-sm'));
      const exampleCount=TEXTBOOK.workedExamples?.[topic.id]?.length||0;
      if(exampleCount) nav.appendChild(bookButton(`例題（${exampleCount}題）`,()=>{
        const heading=$('bookExamplesHeading');
        heading.scrollIntoView({behavior:'smooth',block:'start'}); heading.focus({preventScroll:true});
      },'btn btn-ghost btn-sm'));
      const variantCount=TEXTBOOK.calculationPractice?.[topic.id]?.length||0;
      if(variantCount) nav.appendChild(bookButton(`数字を変えて練習（${variantCount}題）`,()=>{
        const heading=$('bookCalculationHeading');heading.scrollIntoView({behavior:'smooth',block:'start'});heading.focus({preventScroll:true});
      },'btn btn-ghost btn-sm'));
      if(COMPARISON_CARDS.some(c=>c.topicIds.includes(topic.id)))nav.appendChild(bookButton('用語・公式を比較する',()=>{
        const heading=$('bookComparisonsHeading');heading.scrollIntoView({behavior:'smooth',block:'start'});heading.focus({preventScroll:true});
      },'btn btn-ghost btn-sm'));
      article.insertBefore(nav,article.children[navIndex]||null);
    }else{
      article.appendChild(bookNode('p','bookEmpty','このテーマの説明は準備中です。対応する過去問は下から解けます。'));
    }
    const comparisons=bookComparisons(topic.id);if(comparisons)article.appendChild(comparisons);
    const workedExamples=bookWorkedExamples(topic.id);
    if(workedExamples) article.appendChild(workedExamples);
    const calculationExamples=bookWorkedExamples(topic.id,true);
    if(calculationExamples) article.appendChild(calculationExamples);
    article.appendChild(bookLearnedControl(topic));
    const qs=bookQuestions(topic.id);
    const questionHeading=bookNode('h3','',`このテーマの全過去問（${qs.length}問）`);
    questionHeading.id='bookQuestionsHeading'; questionHeading.tabIndex=-1;
    article.appendChild(questionHeading);
    article.appendChild(bookStudyActions(topic.id));
    if(topic.subject==='tekisei' && qs.length){
      article.appendChild(bookNode('p','meta','各問題の「基礎知識」は出題時点の記述です。法令・計画・白書の現行版とは区別してください。'));
    }
    const pending=qs.filter(q=>TEXTBOOK.mapping?.[q.id]?.review!=='manual-reviewed').length;
    if(pending) article.appendChild(bookNode('p','meta',`問題との細かなテーマ対応は確認中です（${pending}問）。`));
    if(!qs.length) article.appendChild(bookNode('p','bookEmpty','過去問0問。前提知識として掲載しています。'));
    const appendQuestion=q=>{
      const unit=bookNode('div','bookQuestionUnit');
      const row=bookNode('div','bookQuestion');
      const info=bookNode('div');
      info.appendChild(bookNode('strong','',`${q.year} ${q.number}`));
      info.appendChild(bookNode('span','meta',q.topicId===topic.id?'主テーマ':'関連テーマ'));
      info.appendChild(bookNode('span','meta',bookStatus(q)));
      row.appendChild(info);
      row.appendChild(bookButton('この問題を解く',()=>startQuiz([q],'study',{
        textbookTopicId:topic.id,textbookScroll:window.scrollY
      }),'btn btn-primary btn-sm'));
      unit.appendChild(row);
      if(q.question) unit.appendChild(bookNode('p','bookQuestionText',q.question));
      if(q.basics?.length){
        const facts=bookNode('details','bookFacts');
        facts.appendChild(bookNode('summary','','この問題の基礎知識を読む'));
        const list=bookNode('ul');
        q.basics.forEach(point=>list.appendChild(bookNode('li','',point)));
        facts.appendChild(list);
        unit.appendChild(facts);
      }
      article.appendChild(unit);
    };
    qs.forEach(appendQuestion);
    if(body?.references?.length){
      article.appendChild(bookNode('h3','','参照資料'));
      body.references.forEach(ref=>{
        const p=bookNode('p');
        const a=bookNode('a','',ref.title||'資料');
        if(/^https:\/\//.test(ref.url||'')){
          a.href=ref.url; a.target='_blank'; a.rel='noopener noreferrer';
        }
        p.appendChild(a);
        p.appendChild(document.createTextNode(`（対象：${ref.asOf||'記載なし'}、確認：${ref.checked||'記載なし'}）`));
        article.appendChild(p);
      });
    }
    article.appendChild(bookButton('← テーマ一覧へ',()=>bookShow(topic.subject,topic.parentId),'btn btn-ghost btn-sm'));
    host.appendChild(article);
    return;
  }
  const card=bookNode('div','bookSelectionBody'); host.appendChild(card);
  if(parent){
    const grid=bookNode('div','bookGrid'); card.appendChild(grid);
    TEXTBOOK.topics.filter(t=>t.parentId===parent.id).forEach(t=>{
      const qs=bookQuestions(t.id), done=qs.filter(bookQuestionAnswered).length;
      const body=TEXTBOOK.content?.[t.id];
      const level=!body?.sections?.length?'説明準備中':body.editorialStatus==='written'?'本文あり':body.editorialStatus==='source-summary'?'要点ノート':'補足あり';
      grid.appendChild(bookCard(`${bookLearned.has(t.id)?'✓ 学習済み：':''}${t.title}`,level,
        ()=>bookShow(t.subject,t.parentId,t.id),[t]));
    });
  }else if(bookState.subject){
    const subj=TEXTBOOK.subjects.find(s=>s.id===bookState.subject);
    if(bookState.subject==='tekisei') card.appendChild(bookNode('p','meta','教科書用の内容別分類です。試験の公式分類ではありません。'));
    const grid=bookNode('div','bookGrid'); card.appendChild(grid);
    TEXTBOOK.parents.filter(p=>p.subject===bookState.subject).forEach(p=>{
      const ids=new Set(TEXTBOOK.topics.filter(t=>t.parentId===p.id).map(t=>t.id));
      const n=QUESTIONS.filter(q=>ids.has(q.topicId)).length;
      grid.appendChild(bookCard(p.title,'テーマ一覧へ進む',()=>bookShow(p.subject,p.id),TEXTBOOK.topics.filter(t=>ids.has(t.id))));
    });
  }else{
    card.appendChild(bookNode('p','cardLead','科目を選んで、分野・テーマへ進みましょう。'));
    const grid=bookNode('div','bookGrid'); card.appendChild(grid);
    TEXTBOOK.subjects.forEach(s=>grid.appendChild(bookCard(s.title,
      '群・分野へ進む',()=>bookShow(s.id),TEXTBOOK.topics.filter(t=>t.subject===s.id))));
  }
}
function bookReturn(){
  if(!S?.textbookTopicId) return;
  const t=BOOK_TOPIC_BY_ID.get(S.textbookTopicId);
  const scroll=S.textbookScroll||0;
  S=null; clearSession();
  if(t) bookShow(t.subject,t.parentId,t.id,scroll);
}
$('btnTextbook').addEventListener('click',()=>bookShow());
$('btnBookFromQuiz').addEventListener('click',bookReturn);
$('btnBookFromResult').addEventListener('click',bookReturn);

/* ---------- 起動 ---------- */
loadHistory();
restoreChoice('homeSubject',savedSetup?.homeSubject);
$('hdBadge').textContent = `${years.length}年度・全${QUESTIONS.length}問`;
$('hdBadge').title = years.join('・');
refreshSetup();
// Each study tool has one entry; comparisons live in the textbook.
$('studyPane').insertBefore($('advancedSettings'),$('homeTools'));
renderResumeCard();
syncChrome();

/* ============================================================
   手書きメモ（フリーボード）
   ・固定サイズの盤面に、指／ペン／マウスで書く。指での描画は切り替え可能
   ・二本指で移動・拡大縮小（ピンチ）。マウスはホイールで拡大縮小、右/中ボタンドラッグで移動
   ・線は盤面座標(world)の点列で保存。表示位置・倍率(view)も問題ごとに保存
   ・localStorage に問題IDごとに保存。次にその問題を開くと自動で復元する
   ============================================================ */
const MEMO_STORE = 'gijutsushi_memo_v1';      // 問題IDごとの線データ
const MEMO_UI    = 'gijutsushi_memo_ui_v1';   // 表示形態・位置・サイズ
const MEMO_PENS   = [['黒','#12161d'],['赤','#d32f2f'],['青','#1565c0']];
const MEMO_WIDTHS = [['細',2],['中',4],['太',7]];
const BOARD_W = 1600, BOARD_H = 1200;
const K_MIN = 0.04, K_MAX = 8;

let memos = {};
let memoUI = {mode:'float', x:null, y:null, w:420, h:520, dockW:42, dockH:45, pen:0, wid:1, finger:true};
let memoKey = 'general', memoLabel = 'メモ';
let memoDoc = {v:3, s:[], view:null};   // s = [[ペン番号, 太さ番号, [x,y,x,y,...]], ...]
let view = {x:-20, y:-20, k:1};         // 画面左上が指す盤面座標(x,y)と倍率k
let memoErasing = false, memoDrawing = null, memoSaveTimer = null, memoViewTimer = null, memoWarned = false;

/* 旧フリーボードと縦スクロール式の線を、固定盤面に収める。 */
function memoNormalize(d){
  if(!d || !Array.isArray(d.s)) return {v:3, s:[], view:null};
  if(d.v === 3){
    const v=d.view;
    const safeView=v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.k) && v.k>=K_MIN && v.k<=K_MAX
      ? {x:v.x,y:v.y,k:v.k} : null;
    return {v:3, s:d.s.slice(), view:safeView};
  }
  const s = d.s.map(st=>[st[0], st[1], st[2].slice()]);
  if(!s.length) return {v:3, s, view:null};
  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
  s.forEach(st=>{ st[2].forEach((n,i)=>{
    if(i%2===0){ x0=Math.min(x0,n); x1=Math.max(x1,n); }
    else{ y0=Math.min(y0,n); y1=Math.max(y1,n); }
  }); });
  if(!Number.isFinite(x0)) return {v:3, s:[], view:null};
  const scale=Math.min(1, (BOARD_W-80)/Math.max(1,x1-x0), (BOARD_H-80)/Math.max(1,y1-y0));
  const ox=(BOARD_W-(x1-x0)*scale)/2, oy=(BOARD_H-(y1-y0)*scale)/2;
  s.forEach(st=>{ st[2]=st[2].map((n,i)=>r1((n-(i%2===0?x0:y0))*scale+(i%2===0?ox:oy))); });
  return {v:3, s, view:null};
}
function memoLoad(){
  try{ memos = JSON.parse(localStorage.getItem(MEMO_STORE) || '{}') || {}; }catch(e){ memos = {}; }
  try{ Object.assign(memoUI, JSON.parse(localStorage.getItem(MEMO_UI) || '{}')); }catch(e){}
  for(const k of Object.keys(memos)) memos[k] = memoNormalize(memos[k]);
}
/* memos への反映は即時（問題を切り替えても直前の線が失われないように）。
   localStorage への書き込みだけをまとめて遅延させる。 */
function memoSave(){
  if(memoDoc.s.length){ memoDoc.view = {x:view.x, y:view.y, k:view.k}; memos[memoKey] = memoDoc; }
  else delete memos[memoKey];
  memoFlag();
  clearTimeout(memoSaveTimer);
  memoSaveTimer = setTimeout(memoFlush, 350);
}
function memoFlush(){
  clearTimeout(memoSaveTimer); memoSaveTimer = null;
  try{ localStorage.setItem(MEMO_STORE, JSON.stringify(memos)); }
  catch(e){
    if(!memoWarned){ memoWarned = true;
      alert('メモの保存容量が上限に達しました。不要な問題のメモを「全消去」で消してください。'); }
  }
}
function memoSaveUI(){ try{ localStorage.setItem(MEMO_UI, JSON.stringify(memoUI)); }catch(e){} }
function memoFlag(){
  const has = !!(memos[memoKey] && memos[memoKey].s && memos[memoKey].s.length);
  $('btnMemo').classList.toggle('has', has);
}
function memoInfo(){
  $('memoInfo').textContent = `盤面 ${BOARD_W}×${BOARD_H}・${memoDoc.s.length}本・${Math.round(view.k*100)}%`;
}
/* 表示位置・倍率の保存（操作が落ち着いてから） */
function memoViewSoon(){
  clearTimeout(memoViewTimer);
  memoViewTimer = setTimeout(()=>{ if(memoDoc.s.length) memoSave(); }, 400);
}

/* 今のキーのメモを memos から読み直す */
function memoLoadCurrent(){
  const d = memos[memoKey];
  memoDoc = d ? {v:3, s:d.s.slice(), view:d.view} : {v:3, s:[], view:null};
  view = memoDoc.view ? {x:memoDoc.view.x, y:memoDoc.view.y, k:memoDoc.view.k} : {x:-20, y:-20, k:1};
  memoFlag();
  if(!$('memo').classList.contains('hide')) memoLayout();
}
/* 表示中の問題が変わったら、その問題のメモに差し替える */
function memoSetKey(key, label){
  if(key === memoKey) return;
  memoDrawing = null; touches.clear(); gesture = null; panning = null;
  memoFlush();                       // 切り替え前に確実に書き出す
  memoKey = key; memoLabel = label || 'メモ';
  $('memoTtl').textContent = memoLabel;
  memoLoadCurrent();
}

/* ---- 表示形態（独立ウィンドウ／左右分割／上下分割） ---- */
function memoIsLandscape(){ return window.innerWidth >= window.innerHeight && window.innerWidth >= 700; }
function memoApplyMode(){
  const el = $('memo'), open = !el.classList.contains('hide');
  const mode = memoUI.mode === 'dock' ? (memoIsLandscape() ? 'dock-side' : 'dock-bottom') : 'float';
  el.dataset.mode = mode;
  document.body.classList.toggle('memo-side',   open && mode==='dock-side');
  document.body.classList.toggle('memo-bottom', open && mode==='dock-bottom');
  document.body.style.setProperty('--memo-w', memoUI.dockW+'%');
  document.body.style.setProperty('--memo-h', memoUI.dockH+'%');
  if(mode==='float'){
    const w = Math.min(memoUI.w, window.innerWidth-16), h = Math.min(memoUI.h, window.innerHeight-16);
    const x = memoUI.x==null ? Math.max(8, window.innerWidth-w-24) : Math.min(memoUI.x, window.innerWidth-w-8);
    const y = memoUI.y==null ? 76 : Math.min(memoUI.y, window.innerHeight-h-8);
    Object.assign(el.style, {left:Math.max(0,x)+'px', top:Math.max(0,y)+'px',
                             width:w+'px', height:h+'px', right:'auto', bottom:'auto'});
  }else if(mode==='dock-side'){
    Object.assign(el.style, {left:'auto', top:'0', right:'0', bottom:'0',
                             width:memoUI.dockW+'%', height:'auto'});
  }else{
    Object.assign(el.style, {left:'0', right:'0', bottom:'0', top:'auto',
                             width:'auto', height:memoUI.dockH+'%'});
  }
  $('memoDock').textContent = mode==='float' ? '分割' : '独立';
  $('memoDock').classList.toggle('on', mode!=='float');
}

/* ---- キャンバスの実寸合わせ＋再描画 ---- */
function memoLayout(){
  memoApplyMode();
  const sc = $('memoScroll'), cv = $('memoCanvas');
  const w = Math.max(120, sc.clientWidth), h = Math.max(80, sc.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = w+'px'; cv.style.height = h+'px';
  cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  cv._dpr = dpr;
  memoClampView();
  memoRedraw(); memoInfo();
}
function memoRedraw(){
  const cv = $('memoCanvas'), cx = cv.getContext('2d'), dpr = cv._dpr || 1;
  const w = cv.clientWidth, h = cv.clientHeight, k = view.k;
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.fillStyle = '#e8edf3'; cx.fillRect(0,0,w,h);
  const bx=-view.x*k, by=-view.y*k;
  cx.fillStyle = '#fcfcfa'; cx.fillRect(bx,by,BOARD_W*k,BOARD_H*k);
  cx.save(); cx.beginPath(); cx.rect(bx,by,BOARD_W*k,BOARD_H*k); cx.clip();
  /* 方眼の点（拡大率に応じて間引く） */
  let g = 40; while(g*k < 16) g *= 2;
  const r = Math.max(1, Math.min(2, k*1.3));
  cx.fillStyle = '#c9d1de';
  for(let X=Math.max(0,Math.floor(view.x/g)*g); X<=BOARD_W && (X-view.x)*k < w; X+=g){
    for(let Y=Math.max(0,Math.floor(view.y/g)*g); Y<=BOARD_H && (Y-view.y)*k < h; Y+=g){
      cx.fillRect((X-view.x)*k - r/2, (Y-view.y)*k - r/2, r, r);
    }
  }
  /* 線 */
  cx.setTransform(dpr*k,0,0,dpr*k,-view.x*k*dpr,-view.y*k*dpr);
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for(const st of memoDoc.s) memoStroke(cx, st);
  if(memoDrawing && !memoDrawing.erase) memoStroke(cx, memoDrawing);
  cx.restore();
  cx.setTransform(dpr,0,0,dpr,0,0);
  cx.strokeStyle = '#98a8bd'; cx.lineWidth=1;
  cx.strokeRect(bx+0.5,by+0.5,BOARD_W*k,BOARD_H*k);
}
function memoStroke(cx, st){
  const pts = st[2];
  if(!pts || pts.length < 2) return;
  cx.strokeStyle = (MEMO_PENS[st[0]]||MEMO_PENS[0])[1];
  cx.lineWidth   = (MEMO_WIDTHS[st[1]]||MEMO_WIDTHS[1])[1];
  cx.beginPath();
  cx.moveTo(pts[0], pts[1]);
  if(pts.length === 2) cx.lineTo(pts[0]+0.01, pts[1]);
  for(let i=2;i<pts.length;i+=2) cx.lineTo(pts[i], pts[i+1]);
  cx.stroke();
}

/* ---- 座標変換・拡大縮小 ---- */
const clampK = k => Math.max(K_MIN, Math.min(K_MAX, k));
function memoClampView(){
  const cv=$('memoCanvas'), w=cv.clientWidth/view.k, h=cv.clientHeight/view.k, pad=20/view.k;
  view.x = w>=BOARD_W+2*pad ? (BOARD_W-w)/2 : Math.max(-pad,Math.min(view.x,BOARD_W-w+pad));
  view.y = h>=BOARD_H+2*pad ? (BOARD_H-h)/2 : Math.max(-pad,Math.min(view.y,BOARD_H-h+pad));
}
function canvasPt(e){
  const r = $('memoCanvas').getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  return {sx, sy, x: sx/view.k + view.x, y: sy/view.k + view.y};
}
function zoomAt(sx, sy, f){
  const wx = sx/view.k + view.x, wy = sy/view.k + view.y;
  view.k = clampK(view.k*f);
  view.x = wx - sx/view.k; view.y = wy - sy/view.k;
  memoClampView();
  memoRedraw(); memoInfo(); memoViewSoon();
}
function memoFit(){
  const cv = $('memoCanvas'), w = cv.clientWidth, h = cv.clientHeight;
  const k=clampK(Math.min((w-40)/BOARD_W,(h-40)/BOARD_H));
  view={k,x:(BOARD_W-w/k)/2,y:(BOARD_H-h/k)/2};
  memoClampView();
  memoRedraw(); memoInfo(); memoViewSoon();
}

/* ---- 消しゴム ---- */
function segDist2(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay, l=dx*dx+dy*dy;
  let t = l ? ((px-ax)*dx+(py-ay)*dy)/l : 0; t = Math.max(0, Math.min(1, t));
  const cx=ax+t*dx-px, cy=ay+t*dy-py; return cx*cx+cy*cy;
}
function memoEraseAt(p){
  if(!memoInside(p)) return;
  const R = 14/view.k, R2 = R*R, before = memoDoc.s.length;
  memoDoc.s = memoDoc.s.filter(st=>{
    const pts = st[2];
    let ax = pts[0], ay = pts[1];
    if((ax-p.x)*(ax-p.x)+(ay-p.y)*(ay-p.y) < R2) return false;
    for(let i=2;i<pts.length;i+=2){
      if(segDist2(p.x,p.y,ax,ay,pts[i],pts[i+1]) < R2) return false;
      ax = pts[i]; ay = pts[i+1];
    }
    return true;
  });
  if(memoDoc.s.length !== before){ memoRedraw(); memoSave(); memoInfo(); }
}

/* ---- 入力：指・ペン・マウスで描く、二本指で移動・拡大縮小 ---- */
const touches = new Map();     // 画面に触れている指
let gesture = null;            // 二本指ジェスチャ中の基準値
let panning = null;            // マウスの右／中ボタンによる移動
const r1 = n => Math.round(n*10)/10;
const memoActivePointers = new Set();
function memoSelectionStart(e){
  memoActivePointers.add(e.pointerId);
  document.body.classList.add('memo-interacting');
  const sel=window.getSelection();
  if(sel && sel.rangeCount) sel.removeAllRanges();
}
function memoSelectionEnd(e){
  memoActivePointers.delete(e.pointerId);
  if(!memoActivePointers.size) document.body.classList.remove('memo-interacting');
}
document.addEventListener('selectstart', e=>{
  if(memoActivePointers.size) e.preventDefault();
}, true);
document.addEventListener('dragstart', e=>{
  if(memoActivePointers.size) e.preventDefault();
}, true);
window.addEventListener('blur', ()=>{
  memoActivePointers.clear(); document.body.classList.remove('memo-interacting');
});

function gestureStart(){
  if(memoDrawing){ memoDrawing = null; memoRedraw(); }   // 書きかけの線は破棄（誤タッチ対策）
  const [a,b] = [...touches.values()];
  const r = $('memoCanvas').getBoundingClientRect();
  const mx = (a.x+b.x)/2 - r.left, my = (a.y+b.y)/2 - r.top;
  gesture = {d0: Math.max(12, Math.hypot(a.x-b.x, a.y-b.y)), k0: view.k,
             wx: mx/view.k + view.x, wy: my/view.k + view.y};
}
function gestureMove(){
  const [a,b] = [...touches.values()];
  const r = $('memoCanvas').getBoundingClientRect();
  const mx = (a.x+b.x)/2 - r.left, my = (a.y+b.y)/2 - r.top;
  const d = Math.hypot(a.x-b.x, a.y-b.y);
  view.k = clampK(gesture.k0 * d / gesture.d0);
  view.x = gesture.wx - mx/view.k; view.y = gesture.wy - my/view.k;
  memoClampView();
  memoRedraw(); memoInfo();
}
function memoInside(p){ return p.x>=0 && p.x<=BOARD_W && p.y>=0 && p.y<=BOARD_H; }
function memoStartDraw(e){
  const p=canvasPt(e);
  if(!memoInside(p)) return;
  if(memoErasing || (e.buttons & 32)){
    memoDrawing={erase:true,pid:e.pointerId}; memoEraseAt(p); return;
  }
  memoDrawing=[memoUI.pen,memoUI.wid,[r1(p.x),r1(p.y)]];
  memoDrawing.pid=e.pointerId;
  memoRedraw();
}
function memoExtendDraw(e){
  if(!memoDrawing || memoDrawing.pid!==e.pointerId) return;
  const evs=(e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
  for(const ev of evs){
    const p=canvasPt(ev);
    if(!memoInside(p)) continue;
    if(memoDrawing.erase){ memoEraseAt(p); continue; }
    const pts=memoDrawing[2], lx=pts[pts.length-2], ly=pts[pts.length-1];
    const m=0.8/view.k;
    if(Math.abs(p.x-lx)<m && Math.abs(p.y-ly)<m) continue;
    pts.push(r1(p.x),r1(p.y));
  }
  if(!memoDrawing.erase) memoRedraw();
}
function memoEndDraw(e){
  if(!memoDrawing || memoDrawing.pid!==e.pointerId) return;
  const st=memoDrawing; memoDrawing=null;
  if(e.type!=='pointercancel' && !st.erase && st[2].length>=2){
    if(st[2].length===2) st[2].push(st[2][0],st[2][1]+0.5);
    memoDoc.s.push([st[0],st[1],st[2]]);
    memoSave();
  }
  memoRedraw(); memoInfo();
}
function memoDown(e){
  e.preventDefault();
  memoSelectionStart(e);
  const cv = $('memoCanvas');
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  if(e.pointerType === 'touch'){
    touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(touches.size === 2) gestureStart();
    else if(touches.size===1 && memoUI.finger) memoStartDraw(e);
    return;
  }
  if(e.pointerType === 'mouse' && e.button !== 0){
    panning = {id:e.pointerId, x:e.clientX, y:e.clientY, vx:view.x, vy:view.y}; return;
  }
  if(gesture) return;
  memoStartDraw(e);
}
function memoMove(e){
  if(memoActivePointers.has(e.pointerId)) e.preventDefault();
  if(e.pointerType === 'touch'){
    if(!touches.has(e.pointerId)) return;
    e.preventDefault();
    touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(gesture && touches.size >= 2) gestureMove();
    else memoExtendDraw(e);
    return;
  }
  if(panning && panning.id === e.pointerId){
    view.x = panning.vx - (e.clientX-panning.x)/view.k;
    view.y = panning.vy - (e.clientY-panning.y)/view.k;
    memoClampView();
    memoRedraw(); return;
  }
  e.preventDefault();
  memoExtendDraw(e);
}
function memoUp(e){
  memoSelectionEnd(e);
  if(e.pointerType === 'touch'){
    memoEndDraw(e);
    touches.delete(e.pointerId);
    if(touches.size >= 2) gestureStart();
    else if(gesture){ gesture = null; memoViewSoon(); }
    return;
  }
  if(panning && panning.id === e.pointerId){ panning = null; memoViewSoon(); return; }
  memoEndDraw(e);
}

/* ---- ツールバーの組み立て ---- */
function memoTools(){
  const pens = $('memoPens'); pens.innerHTML = '';
  MEMO_PENS.forEach(([name,col],i)=>{
    const b = document.createElement('button');
    b.className = 'pen' + (memoUI.pen===i && !memoErasing ? ' on' : '');
    b.style.background = col; b.title = name+'ペン';
    b.addEventListener('click',()=>{ memoUI.pen=i; memoErasing=false; memoSaveUI(); memoTools(); });
    pens.appendChild(b);
  });
  const ws = $('memoWidths'); ws.innerHTML = '';
  MEMO_WIDTHS.forEach(([name],i)=>{
    const b = document.createElement('button');
    b.className = 'w' + (memoUI.wid===i ? ' on' : ''); b.textContent = name; b.title = name+'い線';
    b.addEventListener('click',()=>{ memoUI.wid=i; memoSaveUI(); memoTools(); });
    ws.appendChild(b);
  });
  $('memoErase').classList.toggle('on', memoErasing);
  $('memoFinger').textContent = memoUI.finger ? '指で描く: ON' : '指で描く: OFF';
}

/* ---- 開閉 ---- */
function memoOpen(on){
  const el = $('memo');
  if(on === undefined) on = el.classList.contains('hide');
  el.classList.toggle('hide', !on);
  if(on){
    /* 出題中ならその問題に紐づける */
    if(typeof S !== 'undefined' && S && S.list && S.list[S.i] && !$('quiz').classList.contains('hide')){
      const q = S.list[S.i]; memoSetKey(q.id, `${q.year} ${q.number} のメモ`);
    }else if(memoKey !== 'general'){ memoSetKey('general', 'メモ（全体）'); }
    memoTools(); memoLayout();
  }else{
    document.body.classList.remove('memo-side','memo-bottom');
    memoActivePointers.clear();
    document.body.classList.remove('memo-interacting');
  }
  $('btnMemo').classList.toggle('on', on);
}

/* ---- 移動・リサイズ ---- */
(function memoDragInit(){
  const el = $('memo'), bar = $('memoBar'), grip = $('memoGrip');
  let st = null;
  bar.addEventListener('pointerdown', e=>{
    if(el.dataset.mode !== 'float') return;
    if(e.target.closest('button')) return;
    memoSelectionStart(e);
    st = {t:'move', x:e.clientX, y:e.clientY, l:el.offsetLeft, tp:el.offsetTop};
    bar.setPointerCapture(e.pointerId); e.preventDefault();
  });
  grip.addEventListener('pointerdown', e=>{
    memoSelectionStart(e);
    st = {t:'size', x:e.clientX, y:e.clientY, w:el.offsetWidth, h:el.offsetHeight,
          dw:memoUI.dockW, dh:memoUI.dockH, mode:el.dataset.mode};
    grip.setPointerCapture(e.pointerId); e.preventDefault();
  });
  function move(e){
    if(!st) return;
    e.preventDefault();
    const dx = e.clientX-st.x, dy = e.clientY-st.y;
    if(st.t==='move'){
      memoUI.x = Math.max(0, Math.min(st.l+dx, window.innerWidth-el.offsetWidth));
      memoUI.y = Math.max(0, Math.min(st.tp+dy, window.innerHeight-40));
      el.style.left = memoUI.x+'px'; el.style.top = memoUI.y+'px';
    }else if(st.mode==='float'){
      memoUI.w = Math.max(260, Math.min(st.w+dx, window.innerWidth-8));
      memoUI.h = Math.max(220, Math.min(st.h+dy, window.innerHeight-8));
      el.style.width = memoUI.w+'px'; el.style.height = memoUI.h+'px';
      memoLayout();
    }else if(st.mode==='dock-side'){
      memoUI.dockW = Math.max(20, Math.min(st.dw - dx/window.innerWidth*100, 75));
      memoApplyMode(); memoLayout();
    }else{
      memoUI.dockH = Math.max(20, Math.min(st.dh - dy/window.innerHeight*100, 80));
      memoApplyMode(); memoLayout();
    }
  }
  function up(e){ memoSelectionEnd(e); if(st){ st=null; memoSaveUI(); } }
  bar.addEventListener('pointermove', move); grip.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', up);     grip.addEventListener('pointerup', up);
  bar.addEventListener('pointercancel', up); grip.addEventListener('pointercancel', up);
  bar.addEventListener('lostpointercapture', up); grip.addEventListener('lostpointercapture', up);
})();

$('btnMemo').addEventListener('click', ()=>memoOpen());
$('memoClose').addEventListener('click', ()=>memoOpen(false));
$('memoDock').addEventListener('click', ()=>{
  memoUI.mode = memoUI.mode === 'dock' ? 'float' : 'dock';
  memoSaveUI(); memoLayout();
});
$('memoErase').addEventListener('click', ()=>{ memoErasing = !memoErasing; memoTools(); });
$('memoFinger').addEventListener('click', ()=>{ memoUI.finger = !memoUI.finger; memoSaveUI(); memoTools(); });
$('memoUndo').addEventListener('click', ()=>{
  if(!memoDoc.s.length) return;
  memoDoc.s.pop(); memoRedraw(); memoSave(); memoInfo();
});
$('memoClear').addEventListener('click', ()=>{
  if(!memoDoc.s.length) return;
  if(!confirm('このメモをすべて消します。よろしいですか？')) return;
  memoDoc = {v:3, s:[], view:null}; memoSave(); memoRedraw(); memoInfo();
});
$('memoZoomIn').addEventListener('click',  ()=>{ const c=$('memoCanvas'); zoomAt(c.clientWidth/2, c.clientHeight/2, 1.25); });
$('memoZoomOut').addEventListener('click', ()=>{ const c=$('memoCanvas'); zoomAt(c.clientWidth/2, c.clientHeight/2, 0.8); });
$('memoFit').addEventListener('click', memoFit);
(function(){
  const cv = $('memoCanvas');
  cv.addEventListener('pointerdown', memoDown);
  cv.addEventListener('pointermove', memoMove);
  cv.addEventListener('pointerup', memoUp);
  cv.addEventListener('pointercancel', memoUp);
  cv.addEventListener('lostpointercapture', e=>{
    memoSelectionEnd(e);
    if(memoDrawing && memoDrawing.pid===e.pointerId) memoEndDraw({pointerId:e.pointerId,type:'pointercancel'});
    touches.delete(e.pointerId);
  });
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 0.05 : 0.0015;
    zoomAt(e.clientX-r.left, e.clientY-r.top, Math.exp(-e.deltaY*unit));
  }, {passive:false});
  cv.addEventListener('contextmenu', e=>e.preventDefault());
  $('memo').addEventListener('selectstart', e=>e.preventDefault());
  $('memo').addEventListener('dragstart', e=>e.preventDefault());
})();
window.addEventListener('beforeunload', memoFlush);
window.addEventListener('resize', ()=>{ if(!$('memo').classList.contains('hide')) memoLayout(); });
window.addEventListener('orientationchange', ()=>{ if(!$('memo').classList.contains('hide')) setTimeout(memoLayout,120); });

memoLoad(); memoFlag();

/* キーボード操作（1-5で選択、←→で移動）
   ・入力欄にフォーカスがあるときは奪わない
   ・解答済みで選択肢がロックされているとき（マウスでは.lockedで無効化される）は
     学習モードだけでなく練習モードでも再選択できないようにする */
document.addEventListener('keydown', e=>{
  if($('quiz').classList.contains('hide')) return;
  const t = e.target, tag = t && t.tagName;
  if(e.defaultPrevented || t?.closest?.('#calculator')) return;
  if(tag==='TEXTAREA' || tag==='INPUT' || tag==='SELECT' || (t && t.isContentEditable)) return;
  if(e.key>='1' && e.key<='5'){
    const n=parseInt(e.key,10);
    const q=S.list[S.i];
    const locked = (S.mode==='study' || S.mode==='practice') && S.ans[S.i]!==null;
    if(n<=q.choices.length && !locked) chooseDisplayed(n);
  }
  /* 0キーで「わからない（解説を見る）」 */
  if(e.key==='0' && S.ans[S.i]===null && S.mode!=='exam') choose(GIVEUP);
  if(e.key==='ArrowRight') $('btnNext').click();
  if(e.key==='ArrowLeft')  $('btnPrev').click();
});
renderComparisonCards($('comparisonLibrary'),COMPARISON_CARDS);

/* ============================================================
   PWA / モバイル向けの追加処理
   （build_pwa.py が app.js の末尾に連結する。app.js 内の $ / FIGURES
     などをそのまま使えるように、同じスクリプトとして結合している）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 通知バー ---------- */
  const toast = document.getElementById('toast');
  if (toast) {
    toast.hidden = true;
    document.querySelector('header')?.after(toast);
  }
  let toastTimer = null;
  function showToast(html, actions, ms) {
    if (!toast) return;
    toast.innerHTML = '<span class="sp"></span>';
    toast.firstChild.innerHTML = html;
    (actions || []).forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      if (a.ghost) b.className = 'ghost';
      b.addEventListener('click', () => { hideToast(); a.onClick && a.onClick(); });
      toast.appendChild(b);
    });
    toast.hidden = false;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(hideToast, ms);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    if (toast) toast.hidden = true;
  }

  /* ---------- Service Worker ----------
     app.js はデータ読み込みの後に動的に差し込まれるため、load イベントを
     待つと既に発火済みで登録されないことがある。読み込み済みなら即実行する。 */
  function onReady(fn) {
    if (document.readyState === 'complete') setTimeout(fn, 0);
    else window.addEventListener('load', fn, { once: true });
  }
  let swReg = null;
  if ('serviceWorker' in navigator) {
    onReady(() => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(reg => {
        swReg = reg;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('新しいバージョンがあります', [
                { label: '更新する', onClick: () => { nw.postMessage({ type: 'SKIP_WAITING' }); } },
                { label: 'あとで', ghost: true }
              ]);
            }
          });
        });
        askCacheStatus();
      }).catch(e => console.warn('[pwa] SW登録に失敗:', e));

      // 初回インストール時は clients.claim() でも controllerchange が飛ぶので、
      // 「元から制御されていた場合（＝更新）」だけ再読み込みする
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { askCacheStatus(); return; }
        if (reloading) return; reloading = true; location.reload();
      });
      navigator.serviceWorker.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'FIGS_PROGRESS') setFigProgress(m.done, m.total, false);
        if (m.type === 'FIGS_DONE') setFigProgress(m.done, m.total, true);
        if (m.type === 'CACHE_STATUS') renderCacheStatus(m.figs);
      });
    });
  }
  function askCacheStatus() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller)
      navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATUS', urls:figUrls });
  }

  /* ---------- オフライン検知 ---------- */
  window.addEventListener('offline', () =>
    showToast('オフラインです。保存済みの問題と基礎知識はそのまま利用できます', [{ label: 'OK', ghost: true }], 6000));
  window.addEventListener('online', () => hideToast());

  /* ---------- 前／次バーを画面下に固定 ---------- */
  const btnNext = document.getElementById('btnNext');
  if (btnNext && btnNext.closest('.nav')) btnNext.closest('.nav').classList.add('navfix');

  const quiz = document.getElementById('quiz');
  if (quiz) {
    const sync = () => document.body.classList.toggle('quizmode', !quiz.classList.contains('hide'));
    new MutationObserver(sync).observe(quiz, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  /* ---------- オフライン設定カード（設定画面の末尾に追加） ---------- */
  const setup = document.getElementById('setup');
  const figUrls = (typeof FIGURES === 'object' && FIGURES)
    ? Array.from(new Set([...Object.values(FIGURES),...Object.values(TEXTBOOK.imageAssets||{}),
        ...Object.values(typeof EXPLAIN_FIGS === 'object' && EXPLAIN_FIGS || {}).flat().map(f => f && f.src)]
        .filter(v => typeof v === 'string'))) : [];

  if (setup) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<h2>オフラインで使う</h2>' +
      '<div class="meta" style="display:block;line-height:1.9">' +
        '問題文・解説（全' + (typeof QUESTIONS !== 'undefined' ? QUESTIONS.length : 0) + '問）は<b>初回に自動保存</b>されるので、' +
        '2回目以降は電波が無くても学習できます。<br>' +
        '問題と教科書の図表（' + figUrls.length + '件）は、教科書の図を背景で保存し、問題の図を表示時に保存します。' +
        '事前にまとめて保存しておくこともできます。' +
      '</div>' +
      '<div class="offbar"><i id="figBarFill"></i></div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn btn-ghost btn-sm" id="btnFigDl">図表をまとめて保存</button>' +
        '<span class="meta"><span id="figStatus">—</span></span>' +
      '</div>' +
      '<div id="installHint" class="note hide" style="margin-top:14px"></div>';
    (document.getElementById('appTools')||setup).appendChild(card);

    const btn = card.querySelector('#btnFigDl');
    btn.addEventListener('click', () => {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        setFigStatus('オフライン保存が使えない環境です（httpsまたはlocalhostで開いてください）'); return;
      }
      if (!navigator.onLine) { setFigStatus('オフラインのため保存できません'); return; }
      btn.disabled = true;
      setFigStatus('<span class="spin"></span>保存中…');
      const base = location.href.replace(/[^/]*$/, '');
      navigator.serviceWorker.controller.postMessage({
        type: 'PRECACHE_FIGS', urls: figUrls.map(u => new URL(u, base).href)
      });
    });
  }
  function setFigStatus(html) { const e = document.getElementById('figStatus'); if (e) e.innerHTML = html; }
  function setFigProgress(done, total, fin) {
    const f = document.getElementById('figBarFill');
    if (f) f.style.width = Math.round(done / Math.max(total, 1) * 100) + '%';
    setFigStatus(fin ? ('保存しました（' + done + '/' + total + '件）') :
                       ('<span class="spin"></span>保存中… ' + done + '/' + total));
    if (fin) { const b = document.getElementById('btnFigDl'); if (b) b.disabled = false; }
  }
  function renderCacheStatus(n) {
    const total = figUrls.length || 1;
    const f = document.getElementById('figBarFill');
    if (f) f.style.width = Math.round(Math.min(n, total) / total * 100) + '%';
    setFigStatus(n >= total ? ('図表もすべて保存済み（' + total + '件）')
                            : ('保存済みの図表 ' + n + '/' + total + '件'));
  }

  /* ---------- ホーム画面への追加（インストール） ---------- */
  const hint = () => document.getElementById('installHint');
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!standalone && isIOS) {
    const h = hint();
    if (h) {
      h.className = 'note';
      h.innerHTML = '<div class="ttl">ホーム画面に追加すると使いやすくなります</div>' +
        'Safariの下（iPadは上）にある <b>共有ボタン</b> →「<b>ホーム画面に追加</b>」で、' +
        'アプリとして全画面で起動できます。オフライン保存もそのまま使えます。';
    }
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    const h = hint();
    if (!h || standalone) return;
    h.className = 'note';
    h.innerHTML = '<div class="ttl">ホーム画面に追加できます</div>' +
      '<button class="btn btn-primary btn-sm" id="btnInstall" style="margin-top:8px">アプリとしてインストール</button>';
    const b = document.getElementById('btnInstall');
    b && b.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt(); await deferred.userChoice; deferred = null; h.classList.add('hide');
    });
  });
  window.addEventListener('appinstalled', () => { const h = hint(); h && h.classList.add('hide'); });

  /* ---------- 図表の拡大表示をスマホでも閉じやすく ---------- */
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideToast(); });
})();

/* Schedule hands off to the canonical quiz/recording flow. It never writes history. */
(function scheduleIntegration(){
  const refresh=()=>{loadHistory();if(!$('setup').classList.contains('hide'))refreshSetup();};
  window.addEventListener('storage',e=>{if(e.key===localStorage.key(STORE_KEY)||e.key===null)refresh();});
  window.addEventListener('focus',refresh);
  const token=new URLSearchParams(location.search).get('scheduleTask');
  if(!token||! /^[a-f0-9-]{36}$/.test(token))return;
  let launch;
  try{launch=JSON.parse(sessionStorage.getItem('gijutsushi_schedule_launch:'+token)||'null');}catch(e){return;}
  if(!launch||launch.owner!==localStorage.owner||!Number.isFinite(launch.at)||Date.now()-launch.at>3600000||launch.at>Date.now()+1000)return;
  if(!Array.isArray(launch.ids)||launch.ids.length>1200||!launch.ids.every(id=>typeof id==='string'&&QUESTION_BY_ID.has(id)))return;
  const back=document.createElement('a');back.href='schedule/';back.className='btn btn-ghost btn-sm';back.textContent='← スケジュールへ戻る';
  $('quiz').prepend(back);const resultBack=back.cloneNode(true);$('result').prepend(resultBack);
  const url=new URL(location.href);url.searchParams.delete('scheduleTask');window.history.replaceState(null,'',url);
  if(launch.topicId){const t=BOOK_TOPIC_BY_ID.get(launch.topicId);if(t)bookShow(t.subject,t.parentId,t.id);}
  else if(launch.ids.length)startQuiz([...new Set(launch.ids)].map(id=>QUESTION_BY_ID.get(id)),'study');
})();

/* Appended within the application scope. Drive authorization is user initiated. */
(function(){
  'use strict';
  try{
  const C=window.DriveStudyCore,raw=window.localStorage,owner=studyStorage.owner;
  const actor=crypto.randomUUID(),scope='https://www.googleapis.com/auth/drive.appdata';
  const identityKey='gijutsushi_drive_identity_v1',ledgerKey='gijutsushi_drive_ledger_v1:'+owner;
  let token='',expires=0,busy=false,suppress=false,fileId=null,tokenClient=null;
  let sdkPromise=null,enabled=false,stopped=false,requestedAction='';
  let ledger;
  function read(k,fallback){try{return JSON.parse(raw.getItem(k)||'null')??fallback;}catch(e){return fallback;}}
  try{ledger=C.validate(read(ledgerKey,C.empty(owner)),owner);}catch(e){ledger=C.empty(owner);}
  function localData(){return {history,unsure:[...unsure],learned:[...bookLearned],memos};}
  function persist(doc){raw.setItem(ledgerKey,JSON.stringify(doc));ledger=doc;}
  function capture(){const next=C.capture(ledger,localData(),actor);persist(next);return next;}
  function status(message){statusEl.textContent=message;}
  function update(){
    const who=read(identityKey,{});
    identity.textContent=owner?(who.sub===owner?who.email:'選択済みのGoogleアカウント'):'端末内の記録';
    connect.disabled=busy||!DRIVE_CLIENT_ID||navigator.onLine===false;
    sync.disabled=busy||!DRIVE_CLIENT_ID;
    load.disabled=busy||!DRIVE_CLIENT_ID;
    logout.disabled=busy||!owner;
    migrate.disabled=busy||!owner;
    if(!DRIVE_CLIENT_ID)status('Google接続は準備中です。現在の記録はこの端末に保存されます。');
  }
  const card=document.createElement('section');card.className='card';card.id='driveSyncCard';
  card.innerHTML='<h3>アカウントと端末間の引き継ぎ</h3><p id="driveIdentity" class="meta"></p><p class="meta">Googleドライブのアプリ専用領域に、解答履歴・復習予定・学習済みチェック・自信なし・手書きメモを保存します。保存は端末からドライブへ、読み込みはドライブから端末へ反映します。既存記録と統合します。自動の保存・読み込みは行いません。</p><div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-ghost btn-sm" id="driveConnect">Googleアカウントを接続</button><button type="button" class="btn btn-ghost btn-sm" id="driveNow">ドライブへ保存</button><button type="button" class="btn btn-ghost btn-sm" id="driveLoad">ドライブから読み込み</button><button type="button" class="btn btn-ghost btn-sm" id="driveImport">以前の端末内記録を取り込む</button><button type="button" class="btn btn-ghost btn-sm" id="driveLogout">ログアウト</button></div><p id="driveSyncStatus" class="meta" role="status" aria-live="polite"></p>';
  document.getElementById('recordCard')?.after(card);
  const identity=card.querySelector('#driveIdentity'),statusEl=card.querySelector('#driveSyncStatus');
  const connect=card.querySelector('#driveConnect'),sync=card.querySelector('#driveNow'),logout=card.querySelector('#driveLogout'),migrate=card.querySelector('#driveImport');
  sync.textContent='ドライブへ保存';
  const load=card.querySelector('#driveLoad');
  card.querySelector('h3').textContent='アカウントとドライブ保存';
  function fail(error){
    if(error?.expired){token='';enabled=false;status('接続の有効期限が切れました。Googleアカウントを再接続してください。未送信の記録は端末内に残っています。');}
    else status('同期できませんでした。端末内の記録は残っています。通信を確認して再試行してください。'+(error?.message?' '+error.message:''));
    update();
  }
  async function request(url,options={}){
    if(stopped||!token||Date.now()>=expires)throw Object.assign(Error('再接続が必要です。'),{expired:true});
    const response=await fetch(url,{...options,cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if(response.status===401)throw Object.assign(Error('再接続が必要です。'),{expired:true});
    if(!response.ok)throw Error('Google Drive HTTP '+response.status);
    if(response.headers.get('content-length')&&Number(response.headers.get('content-length'))>20*1024*1024)throw Error('保存データが20MBを超えています。');
    const text=await response.text();if(text.length>20*1024*1024)throw Error('保存データが大きすぎます。');
    return text?JSON.parse(text):{};
  }
  function validMemo(d){return d&&[2,3].includes(d.v)&&Array.isArray(d.s)&&d.s.every(s=>Array.isArray(s)&&Number.isInteger(s[0])&&Number.isInteger(s[1])&&Array.isArray(s[2])&&s[2].length>=2&&s[2].length%2===0&&s[2].every(Number.isFinite));}
  function apply(doc){
    const data=C.materialize(doc),validQuestions=new Set([...QUESTIONS,...PREDICTIONS].map(q=>q.id));
    const nextHistory={},nextMemos={};
    for(const [id,h] of Object.entries(data.history))if(validQuestions.has(id))nextHistory[id]=normalizeStudyRecord(id,h);
    for(const [id,m] of Object.entries(data.memos))if((validQuestions.has(id)||id==='general')&&validMemo(m))nextMemos[id]=memoNormalize(m);
    const nextUnsure=data.unsure.filter(id=>validQuestions.has(id));
    const nextLearned=data.learned.filter(id=>BOOK_TOPIC_BY_ID.has(id));
    // Persist all data before updating the in-memory view; quota failures stay visible.
    suppress=true;
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(nextHistory));
      localStorage.setItem(UNSURE_KEY,JSON.stringify(nextUnsure));
      localStorage.setItem(BOOK_LEARNED_KEY,JSON.stringify(nextLearned));
      localStorage.setItem(MEMO_STORE,JSON.stringify(nextMemos));
      history=nextHistory;unsure=new Set(nextUnsure);bookLearned=new Set(nextLearned);memos=nextMemos;
      memoLoadCurrent();refreshSetup();if(!$('textbook').classList.contains('hide'))renderBook();
    }finally{suppress=false;}
  }
  async function listFiles(){
    let files=[],page='';
    do{
      const q=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='app' and value='gijutsushi-sync-v1' }",fields:'nextPageToken,files(id,size)',pageSize:'100'});
      if(page)q.set('pageToken',page);
      const result=await request('https://www.googleapis.com/drive/v3/files?'+q);
      files.push(...(result.files||[]));page=result.nextPageToken||'';
      if(files.length>500)throw Error('保存ファイルが500件を超えています。整理が必要です。');
    }while(page);
    return files;
  }
  async function upload(doc){
    const body=JSON.stringify(doc);if(new Blob([body]).size>20*1024*1024)throw Error('学習記録が20MBを超えています。');
    if(!fileId){
      const boundary='study_'+actor;
      const meta={name:'gijutsushi-'+actor+'.json',parents:['appDataFolder'],appProperties:{app:'gijutsushi-sync-v1'}};
      const payload='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--';
      const result=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:payload});
      if(typeof result.id!=='string')throw Error('保存先を作成できませんでした。');fileId=result.id;
    }else await request('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body});
  }
  async function synchronize(mode){
    if(busy||!enabled||!token||stopped)return;
    if(navigator.onLine===false){status('オフラインです。記録は端末内に保存されています。');return;}
    // Do not replace an active answer or drawing session underneath the learner.
    if(!$('quiz').classList.contains('hide')||!$('memo').classList.contains('hide')){status('学習中の記録は端末内に保存済みです。学習画面を閉じてから、保存または読み込みを押してください。');return;}
    busy=true;update();status(mode==='save'?'保存する記録を確認しています…':'ドライブから学習記録を読み込んでいます…');
    try{
      capture();const files=await listFiles();const docs=[];
      for(const file of files){
        if(Number(file.size)>20*1024*1024)throw Error('保存データが大きすぎます。');
        docs.push(C.validate(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media'),owner));
      }
      // Capture edits made during network requests and merge again before upload.
      const merged=C.merge([...docs,capture()],owner,mergeStudyRecord);
      if(stopped) return;
      if(!$('quiz').classList.contains('hide')||!$('memo').classList.contains('hide')){status('学習画面を閉じてから、もう一度保存または読み込みを押してください。端末内の記録は保存済みです。');return;}
      if(mode==='save'){
        // Preserve other devices' records on Drive, without applying them locally.
        status('ドライブへ保存しています…');await upload(merged);
      }else{
        if(!docs.length){status('ドライブに保存された記録がありません。元の端末で「ドライブへ保存」を押してください。');return;}
        // Reading never writes back to Drive. Keep unsaved local work when merging.
        apply(merged);persist(merged);
      }
      raw.setItem('gijutsushi_drive_'+mode+'_v1:'+owner,String(Date.now()));
      const data=C.materialize(mode==='save'?capture():merged);
      status((mode==='save'?'ドライブへ保存しました':'ドライブから読み込みました')+'（'+new Date().toLocaleTimeString('ja-JP')+'）。端末の解答記録 '+Object.keys(data.history).length+'問・学習済み '+data.learned.length+'テーマ。');
    }catch(e){fail(e);}finally{busy=false;update();}
  }
  function schedule(){
    if(suppress||!owner||stopped)return;
    try{capture();}catch(e){status('端末内の同期情報を保存できません。記録を書き出して空き容量を確認してください。');return;}
    if(!busy)status('端末内の記録を更新しました。ドライブへ反映するには「ドライブへ保存」を押してください。');
  }
  async function authorized(response){
    busy=true;update();
    try{
      if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,scope,'openid','email'))throw Error('必要な接続許可がありません。');
      if(!Number.isFinite(Number(response.expires_in))||Number(response.expires_in)<=60)throw Error('Google接続の有効期限を確認できません。');
      token=response.access_token;expires=Date.now()+Math.max(0,Number(response.expires_in)*1000-60000);
      const user=await request('https://www.googleapis.com/oauth2/v3/userinfo');
      if(!C.cleanId(user.sub)||!user.email||!user.email_verified)throw Error('Googleアカウントを確認できません。');
      if(user.sub!==owner){
        memoFlush();
        // Existing local records are not silently uploaded to a newly selected user.
        raw.setItem(identityKey,JSON.stringify({sub:user.sub,email:user.email}));
        studyStorage.switchTo(user.sub);
        raw.setItem('gijutsushi_drive_notice','アカウントを選択しました。「ドライブへ保存」または「ドライブから読み込み」を押してください。以前の端末内記録は取り込みボタンで追加できます。');
        stopped=true;token='';location.reload();return;
      }
      raw.setItem(identityKey,JSON.stringify({sub:user.sub,email:user.email}));
      enabled=true;busy=false;
      const action=requestedAction;requestedAction='';
      if(action)await synchronize(action);else status('Googleへ接続しました。保存または読み込みを選んでください。');
    }catch(e){token='';enabled=false;fail(e);}finally{busy=false;update();}
  }
  function prepareSDK(){
    if(!DRIVE_CLIENT_ID||navigator.onLine===false)return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      script.onload=()=>{try{tokenClient=google.accounts.oauth2.initTokenClient({client_id:DRIVE_CLIENT_ID,scope:scope+' openid email',include_granted_scopes:false,callback:authorized,error_callback:()=>{busy=false;status('Googleの接続画面が閉じられたか、開けませんでした。もう一度接続してください。');update();}});resolve();}catch(e){reject(e);}};
      script.onerror=()=>{sdkPromise=null;reject(Error('Google接続を読み込めませんでした。'));};document.head.appendChild(script);
    });return sdkPromise;
  }
  function connectGoogle(){
    if(navigator.onLine===false){status('オフラインです。インターネットに接続してから、もう一度保存または読み込みを押してください。');return;}
    if(!tokenClient){prepareSDK().then(()=>status('接続の準備ができました。もう一度接続ボタンを押してください。')).catch(fail);return;}
    // Invoked synchronously from the click to work with Safari popup restrictions.
    busy=true;update();status('Googleの接続画面でアカウントを選択してください。');
    try{tokenClient.requestAccessToken({prompt:'select_account'});}catch(e){busy=false;fail(e);}
  }
  connect.addEventListener('click',()=>{requestedAction='';connectGoogle();});
  function runAction(mode){
    if(busy){status('同期処理中です。完了までお待ちください。');return;}
    if(stopped){status('別の画面でアカウントが変更されました。この画面を再読み込みしてください。');return;}
    if(navigator.onLine===false){status('オフラインです。記録は端末内に保存されています。接続後に保存または読み込みを押してください。');return;}
    if(!enabled||!token||Date.now()>=expires){requestedAction=mode;connectGoogle();return;}
    return synchronize(mode);
  }
  sync.addEventListener('click',()=>runAction('save'));
  load.addEventListener('click',()=>runAction('load'));
  logout.addEventListener('click',()=>{
    if(!confirm('この端末をログアウトします。未同期の記録もアカウント別に端末内へ残します。'))return;
    memoFlush();capture();stopped=true;enabled=false;token='';studyStorage.switchTo('');location.reload();
  });
  migrate.addEventListener('click',()=>{
    if(!confirm('接続前にこの端末へ保存した学習記録を、現在のアカウントへ取り込みますか？ 元の記録は残します。'))return;
    try{
      const previous={history:read(C.KEYS.history,{}),unsure:read(C.KEYS.unsure,[]),learned:read(C.KEYS.learned,[]),memos:read(C.KEYS.memos,{})};
      const legacy=C.capture(C.empty(owner),previous,'legacy-import',1);
      const merged=C.merge([legacy,capture()],owner,mergeStudyRecord);apply(merged);persist(merged);schedule();
      status('以前の端末内記録を取り込みました。「ドライブへ保存」を押すとドライブへ反映します。');
    }catch(e){fail(e);}
  });
  window.addEventListener('study-local-change',schedule);
  window.addEventListener('online',()=>{update();prepareSDK().catch(fail);});
  window.addEventListener('offline',()=>{status('オフラインです。記録は端末内に保存されます。');update();});
  window.addEventListener('storage',e=>{if(e.key===C.ACTIVE&&raw.getItem(C.ACTIVE)!==owner){stopped=true;token='';location.reload();}});
  const notice=raw.getItem('gijutsushi_drive_notice');
  update();status(notice|| (owner?'端末内のアカウント別記録を表示しています。保存または読み込みを選んでください。':'未接続です。現在の記録は端末内に保存されています。'));
  raw.removeItem('gijutsushi_drive_notice');if(!DRIVE_CLIENT_ID)update();
  prepareSDK().catch(fail);
  }catch(error){
    const card=document.getElementById('driveSyncCard');
    if(card){
      const message=card.querySelector('#driveSyncStatus');
      if(message)message.textContent='同期画面を起動できませんでした。学習記録は端末内に残っています。ページを再読み込みしてください。 '+String(error?.message||error);
      for(const button of card.querySelectorAll('button'))button.disabled=true;
    }
    console.error('Drive sync initialization failed',error);
  }
})();

}
