'use strict';
const P=Planner,$=id=>document.getElementById(id),LEGACY_KEY='gijutsushi_schedule_prototype_v1';
const appStorage=DriveStudyCore.storage(window.localStorage),APP_HISTORY='gijutsushi_r7_history_v1',KEY=appStorage.owner?'gijutsushi_schedule_v2:'+appStorage.owner:'gijutsushi_schedule_v2:local';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>s==='専門科目(建設部門)'?'建設部門':s;
const fmt=d=>`${+d.slice(5,7)}/${+d.slice(8)}（${'日月火水木金土'[P.date(d).getDay()]}）`;
const pct=r=>r===null?'—':Math.round(r*100)+'%';
let today=P.day(new Date());
let qs=[],predictions=[],book={},tab='today',selected=today<P.defaults.start?P.defaults.start:today,weekStart=selected,state={config:structuredClone(P.defaults),source:'app',history:{},checks:{},notes:{},sessionLog:[]},model;
function tell(message){$('notice').textContent=message;}
function save(changed=true){try{if(changed&&state.source==='app'){state._syncAt=Date.now();state._syncActor=crypto.randomUUID();}localStorage.setItem(KEY,JSON.stringify(state));if(changed&&state.source==='app')window.dispatchEvent(new Event('schedule-plan-change'));}catch(e){tell('端末への保存ができません。計画を書き出して保存してください。');}}
function readAppHistory(){
 if((window.localStorage.getItem(DriveStudyCore.ACTIVE)||'')!==appStorage.owner){location.reload();return;}
 try{state.history=P.normalize(JSON.parse(appStorage.getItem(APP_HISTORY)||'{}'),qs);}catch(e){throw Error('アプリの学習記録を読み込めません。アプリの記録画面で確認してください。');}
}
function launchApp(task){
 const token=crypto.randomUUID();
 try{sessionStorage.setItem('gijutsushi_schedule_launch:'+token,JSON.stringify({owner:appStorage.owner,at:Date.now(),ids:task.ids.map(q=>q.id),topicId:task.topicId||null}));location.href='../index.html?scheduleTask='+encodeURIComponent(token);}
 catch(e){tell('演習を開けませんでした。ブラウザーの保存設定を確認してください。');}
}
function resumeSync(){const now=P.day(new Date());if(now!==today){if(selected===today)selected=now;today=now;}if(!qs.length||state.source!=='app')return;if($('detail').open)return;try{render();}catch(e){tell(e.message);}}
function reloadPlan(){try{const next=JSON.parse(localStorage.getItem(KEY)||'null');if(next?.config&&!P.validate(next.config)){state={...state,...next,history:state.history,goal:validGoal(next.goal)?next.goal:null};render();}}catch(e){tell('同期した計画を読み込めませんでした。再読み込みしてください。');}}
window.addEventListener('schedule-cloud-applied',reloadPlan);
const fields=[['start','学習開始日','date'],['finish','過去問の完了目標','date'],['prediction','予想問題の日','date'],['final','最終確認の日','date'],['exam','試験日（自分で確認）','date'],['target','各科目の目標正答率（%）','number',1,100,1],['weekdayNew','平日の新規目標（問）','number',1,100,1],['holidayNew','休日の新規目標（問）','number',1,150,1],['weekdayReview','平日の復習目標（問）','number',0,50,1],['holidayReview','休日の復習目標（問）','number',0,70,1],];
function render(){
 if(state.source==='app')readAppHistory();
 const todayDone=state.goal?P.goalProgress(qs,state.history,state.goal,today,today).actual:0;
 model=P.plan(qs,state.history,state.config,today,todayDone);
 if(!state.goal){state.goal=P.createGoal(qs,state.history,state.config,today);save(false);}
 $('sourceLabel').textContent='アプリと自動連動中 · 同じブラウザー・アカウントの記録';
 document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==tab);
 document.querySelectorAll('[data-tab]').forEach(e=>{e.classList.toggle('active',e.dataset.tab===tab);if(e.dataset.tab===tab)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
 if(tab==='today')renderToday();if(tab==='calendar')renderCalendar();if(tab==='progress')renderProgress();if(tab==='settings')renderSettings();
}
function switchTab(name){tab=name;render();}
function selectedRow(){return model.rows.find(r=>r.day===selected)||{day:selected,count:0,...P.capacity(selected,state.config)};}
function tasks(){
 const c=state.config,row=selectedRow(),st=P.stats(qs,state.history),allocation=P.allocate(row.count,st,c.target),review=P.review(qs,state.history,selected);
 if(selected===c.exam)return [{id:'exam',time:'本試験',title:'準備した力を出す日',text:'受験票・会場・持ち物・移動経路を確認。',ids:[]}];
 if(selected===c.prediction)return [{id:'prediction',time:'予想問題の日',title:'予想問題を本番のつもりで',text:'収録されている予想問題80問から練習できます。正式な予想模試55問の選択・時間制限は本番アプリで行ってください。',ids:predictions.filter(q=>q.answer!=null),mode:'prediction'}];
 if(selected===c.final)return [{id:'final',time:'最終確認',title:'弱点の確認と、早めの休息',text:'新しい範囲は増やさず、間違えた問題を確認します。',ids:review.slice(0,15),mode:'review'}];
 if(selected<c.start||selected>c.finish||row.type==='rest')return [];
 const reviewIds=review.slice(0,row.reviewCount);
 const entries=[];
 entries.push({id:'review',time:'復習の問題数',title:`前日までの不正解を復習 · ${reviewIds.length}問`,text:`復習目標 ${row.reviewCount}問。対象が少ない日は、対象問題だけ復習します。`,ids:reviewIds,mode:'review'});
 const suggestions=P.suggestThemes(qs,state.history,book.topics,row.count);
 suggestions.forEach(g=>entries.push({id:'theme-'+g.topic.id,time:g.untouched?'未学習テーマ':'一部学習済みテーマの残り',title:`${g.topic.title} · 約${g.questions.length}問`,text:`${short(g.questions[0].subject)}。${g.questions.length<g.totalPending?`未演習${g.totalPending}問のうち${g.questions.length}問。続きは次回。`:'このテーマの未演習問題をまとめて学習します。'}`,ids:g.questions,mode:'new',topicId:g.topic.id}));
 if(!suggestions.length)entries.push({id:'new',time:'新規学習',title:'この日の新規目標分は完了、または全問演習済みです。',text:'実績と残りの問題数を確認できます。',ids:[]});
 return entries;
}
function topicRows(){
 return book.topics.map(t=>{const all=qs.filter(q=>q.topicId===t.id),done=all.filter(q=>state.history[q.id]?.n&&typeof state.history[q.id].lastOk==='boolean'),ok=done.filter(q=>state.history[q.id].lastOk).length;return {...t,done:done.length,rate:done.length?ok/done.length:null,wrong:done.filter(q=>!state.history[q.id].lastOk)};}).filter(t=>t.wrong.length).sort((a,b)=>a.rate-b.rate||b.wrong.length-a.wrong.length);
}
function renderToday(){
 const c=state.config,st=P.stats(qs,state.history),total=st.reduce((n,s)=>n+s.total,0),done=total-model.remaining,row=selectedRow(),entries=tasks(),remainingDays=Math.max(0,Math.ceil((P.date(c.exam)-P.date(today))/86400000));
 const completed=entries.filter(t=>state.checks[selected+':'+t.id]).length;
 const warning=model.shortfall?`設定した問題数では完了目標までに ${model.shortfall}問不足します。1日の目標問題数、または完了目標日を調整してください。`:`設定した問題数で完了できる見込みです。目標日までの予備は ${model.spare}問分です。`;
 $('today').innerHTML=`<div class="panel hero"><div><p class="eyebrow">ONE STEP AT A TIME</p><h2>${model.shortfall?'今のペースを、一度見直そう。':'今日は、今日の分だけ。'}</h2><p class="muted">${fmt(c.finish)}までに過去問を一周。<br>平日 新規${c.weekdayNew}問・復習${c.weekdayReview}問 ／ 休日 新規${c.holidayNew}問・復習${c.holidayReview}問。</p></div><div class="countdown"><small>試験まで</small><div><span class="big">${remainingDays}</span> 日</div><small>${fmt(c.exam)}</small></div></div>
 <div class="kpis"><div class="kpi"><small>過去問の進捗</small><strong>${done}</strong><span> / ${total}問</span><div class="meter"><i style="width:${done/total*100}%"></i></div></div><div class="kpi"><small>残りの過去問</small><strong>${model.remaining}</strong><span> 問</span><small>予想問題${predictions.length}問は別枠</small></div><div class="kpi"><small>完了に必要な新規ペース</small><strong>${model.neededPerDay??"—"}</strong><span> 問 / 日</span><small>残りの学習予定 ${model.rows.filter(r=>r.newCount>0).length}日</small></div></div>
 <div class="note ${model.shortfall?'warning':''}">${warning}<br><span class="hint">公式過去問1,120問のうち、採点対象外の3問を除く1,117問を進捗・計画の対象にしています。</span></div>
 ${renderGoalProgress()}
 <div class="columns"><div><div class="panel"><div class="sectionhead"><h2>${selected===today?'今日':fmt(selected)}の予定 <span class="badge">${completed}/${entries.length}チェック</span></h2><input aria-label="表示する日" id="selectedDate" type="date" value="${selected}"></div><div id="taskList">${entries.map(t=>`<article class="task ${state.checks[selected+':'+t.id]?'checked':''}"><input type="checkbox" data-check="${t.id}" aria-label="${esc(t.title)}を完了" ${state.checks[selected+':'+t.id]?'checked':''}><div><div class="tasktime">${t.time}</div><h3>${esc(t.title)}</h3><p class="hint">${esc(t.text)}</p>${t.mode?`<div class="actions">${t.topicId?`<button class="quiet" data-book="${esc(t.topicId)}">教科書でテーマを確認</button>`:''}<button class="primary" data-task="${t.id}" ${t.ids.length?'':'disabled'}>${state.source==='app'?'アプリで演習 →':'演習を試す →'}</button></div>`:''}</div></article>`).join('')||`<p class="resttitle">${row.type==='rest'?'お休みの日。予定は、ほかの日へ。':selected<c.start?'学習開始前の準備期間です。':'通常の過去問計画はありません。'}</p><p class="muted">カレンダーで学習する日を選べます。</p>`}</div><div class="dayedit"><label for="dayType">この日の扱い</label><select id="dayType"><option value="auto">自動（土日は休日）</option><option value="weekday">平日ペース</option><option value="holiday">休日ペース</option><option value="rest">お休み</option></select></div></div>
 <div class="note"><strong>余裕があれば · 任意</strong><br>目標より多く解いた分も、自動で実績に反映します。早く進んだ分は、その後の予備日になります。</div><div class="panel"><h3>今日のひとこと</h3><label class="hint" for="dailyNote">つまずいたこと・次に確認したいこと</label><textarea id="dailyNote" rows="3" style="width:100%;margin-top:8px;padding:10px;border:1px solid #ccd7ce;border-radius:8px;font:inherit">${esc(state.notes[selected]||'')}</textarea><button id="saveNote" class="quiet">メモを保存</button></div></div>
 <aside><div class="panel"><p class="eyebrow">SUBJECT BALANCE</p><h2>一周と、理解度。</h2><p class="hint">正答率は問題ごとの最後の解答で計算。両方の目標を分けて確認します。</p>${st.map(s=>`<div class="subject"><div class="subjectline"><strong>${short(s.subject)}</strong><b>${pct(s.rate)}</b></div><div class="meter"><i style="width:${(s.rate||0)*100}%"></i></div><div class="hint">${s.correct}/${s.scored}問が直近正解 · 目標${c.target}%<br>未演習 ${s.left}問 / 全${s.total}問</div></div>`).join('')}</div><div class="panel"><p class="eyebrow">REVISIT</p><h2>先に確認したいテーマ</h2>${topicRows().slice(0,3).map(t=>`<div class="topic"><h3>${esc(t.title)}</h3><div class="hint">直近正答率 ${pct(t.rate)} · 演習済み${t.done}問</div><button data-book="${esc(t.id)}">教科書を読む →</button></div>`).join('')||'<p class="hint">誤答したテーマがここに表示されます。</p>'}</div></aside></div>`;
 $('selectedDate').onchange=e=>{if(P.validDay(e.target.value)){selected=e.target.value;render();}};
 $('dayType').value=c.overrides[selected]||'auto';$('dayType').onchange=e=>{if(e.target.value==='auto')delete c.overrides[selected];else c.overrides[selected]=e.target.value;save();render();tell('この日の扱いを保存し、未演習の残数を残りの日へ再配分しました。');};
 $('saveNote').onclick=()=>{state.notes[selected]=$('dailyNote').value;save();tell('メモを保存しました。');};
 document.querySelectorAll('[data-check]').forEach(e=>e.onchange=()=>{state.checks[selected+':'+e.dataset.check]=e.checked;save();render();});
 document.querySelectorAll('[data-task]').forEach(e=>e.onclick=()=>startPractice(entries.find(t=>t.id===e.dataset.task)));
 bindBooks();bindGoal();
}
function validGoal(g){return !!g&&Number.isFinite(g.createdAt)&&Number.isFinite(g.remaining)&&g.remaining>=0&&P.validDay(g.start)&&P.validDay(g.finish)&&g.baseline&&typeof g.baseline==='object'&&Array.isArray(g.rows)&&g.rows.every(r=>P.validDay(r.day)&&Number.isFinite(r.count)&&r.count>=0&&Number.isFinite(r.reviewCount)&&r.reviewCount>=0);}
function renderGoalProgress(detailed=false){
 const g=state.goal,week=P.add(selected,-((P.date(selected).getDay()+6)%7));
 const ranges=[['選択日の目標',selected,selected],['選択週の目標',week,P.add(week,6)],['完了までの目標',g.start,g.finish]];
 const cumulative=P.goalProgress(qs,state.history,g,g.start,selected),all=P.goalProgress(qs,state.history,g,g.start,g.finish);
 const difference=all.overall-(selected>=g.finish?g.remaining:cumulative.target);
 if(selected>=g.finish)cumulative.target=g.remaining;
 const status=selected<g.start?'計画開始前':difference>=0?`予定より ${difference}問先行`:`予定まで あと ${-difference}問`;
 const rows=ranges.map(([name,from,to],i)=>{const r={name,...P.goalProgress(qs,state.history,g,from,to)};if(i===2)r.target=g.remaining;return r;});
 return `<div class="panel goalpanel"><div class="sectionhead"><div><p class="eyebrow">PLAN & ACTUAL</p><h2>目標に対して、いまどこ？</h2></div><span class="badge">${status}</span></div><p class="hint">${fmt(selected)}の終了時点の累計目標：新規 ${cumulative.target}問 / 保存した目標からの実績：${all.overall}問。基準保存時に解答済みだった問題は含みません。${g.shortfall?`保存した目標問題数では完了目標に${g.shortfall}問分不足しています。`:""}</p><div class="goalgrid">${rows.map((r,i)=>{const n=i===2?r.overall:r.actual,rate=r.target?n/r.target:null;return `<div class="goalkpi"><small>${r.name}</small><div><strong>${n}</strong> / ${r.target}問</div><div class="meter"><i style="width:${Math.min(100,(rate||0)*100)}%"></i></div><span>${rate===null?'新規の予定なし':Math.round(rate*100)+'%達成'}${r.target&&n<r.target?' · あと'+(r.target-n)+'問':''}</span><small>復習実績 ${r.reviews}問 / 目標 ${r.reviewTarget}問</small></div>`;}).join('')}</div><p class="hint">新規は目標保存後に初めて解いた問題の数、復習は表示期間内に解き直した問題数です（同日の同一問題は1問）。復習は目標保存前に解いた当日分も含みます。予定のチェックでは実績は増えません。${all.undated?`実施日を特定できない新規${all.undated}問は全体実績だけに含めています。`:''}</p>${detailed?`<div class="tablewrap"><table><thead><tr><th>週</th><th>新規目標</th><th>新規実績</th><th>差（実績−目標）</th><th>達成率</th></tr></thead><tbody>${goalWeeks().map(w=>{const r=P.goalProgress(qs,state.history,g,w.from,w.to);return `<tr><td>${fmt(w.from)}〜${fmt(w.to)}</td><td>${r.target}問</td><td>${r.actual}問</td><td>${r.gap>0?'+':''}${r.gap}問</td><td>${r.rate===null?'—':Math.round(r.rate*100)+'%'}</td></tr>`;}).join('')}</tbody></table></div>`:''}<div class="actions"><button class="quiet" id="resetGoal">現在の条件で目標を作り直す</button></div><p class="hint" style="margin:10px 0 0">比較する目標は保存時の計画で固定（${fmt(P.day(new Date(g.createdAt)))}保存）。自動再計画や休日の変更で過去の目標は変わりません。週の数値は週末、日の数値はその日の終了までの目標です。復習は設定した問題数を上限に、その日の対象問題を出題します。</p></div>`;
}
function goalWeeks(){const g=state.goal,map=new Map();for(const r of g.rows){const from=P.add(r.day,-((P.date(r.day).getDay()+6)%7));if(!map.has(from))map.set(from,{from,to:P.add(from,6)});}return [...map.values()];}
function bindGoal(){const b=$('resetGoal');if(b)b.onclick=()=>{if(!confirm('今までの比較目標を置き換え、現在の学習記録から新しい目標を保存します。解答記録は残ります。'))return;state.goal=P.createGoal(qs,state.history,state.config,today);save();render();tell('現在の条件で比較目標を保存しました。この時点からの新規演習を実績として数えます。');};}
function bindBooks(){document.querySelectorAll('[data-book]').forEach(e=>e.onclick=()=>readBook(e.dataset.book));}
function renderCalendar(){
 let start=P.add(weekStart,-((P.date(weekStart).getDay()+6)%7)),ds=P.days(start,P.add(start,27));
 $('calendar').innerHTML=`<div class="panel"><div class="sectionhead"><div><p class="eyebrow">FLEXIBLE CALENDAR</p><h2>お休みも含めて、計画する。</h2></div><div class="actions"><button id="prevMonth">← 4週前</button><button id="nextMonth">4週後 →</button></div></div><p class="hint">日付を選ぶとその日の予定が開きます。「お休み」に変えると、未演習の残数を残りの日の目標問題数に沿って再配分します。日付が過ぎたチェックを問題の解答実績には変換しません。</p><div class="weeklabels">${['月','火','水','木','金','土','日'].map(s=>`<span>${s}</span>`).join('')}</div><div class="weekgrid">${ds.map(d=>{const r=model.rows.find(r=>r.day===d),c=state.config,special=d===c.exam?'本試験':d===c.prediction?'予想問題':d===c.final?'最終確認':'';return `<button data-day="${d}" class="day ${d===selected?'selected':''} ${P.dayType(d,c)==='rest'?'rest':''}"><b>${+d.slice(5,7)}/${+d.slice(8)}</b>${special?`<span class="badge">${special}</span>`:`<small>${P.dayType(d,c)==='rest'?'お休み':r?'新規 '+r.count+'問':d<today?'過去の日':'計画外'}</small>`}${d===today?'<small>今日</small>':''}</button>`;}).join('')}</div></div><div class="panel"><h2>これからの週別配分</h2><p class="hint">未演習の残数を、今から完了目標日までの日ごとの目標問題数に合わせて再計算しています。</p>${weekGroups().map(w=>`<div class="weeksummary"><strong>${fmt(w.first)} 〜 ${fmt(w.last)}</strong><span class="hint">新規 ${w.count}問 / 目標合計 ${w.capacity}問 / 学習 ${w.days}日</span></div>`).join('')||'<p>今後の過去問計画はありません。</p>'}<div class="note" style="margin-top:20px">${fmt(state.config.prediction)}：予想問題 → ${fmt(state.config.final)}：弱点の最終確認 → ${fmt(state.config.exam)}：本試験</div></div>`;
 document.querySelectorAll('[data-day]').forEach(e=>e.onclick=()=>{selected=e.dataset.day;switchTab('today');window.scrollTo(0,0);});
 $('prevMonth').onclick=()=>{weekStart=P.add(weekStart,-28);render();};$('nextMonth').onclick=()=>{weekStart=P.add(weekStart,28);render();};
}
function weekGroups(){const map=new Map();for(const r of model.rows){const monday=P.add(r.day,-((P.date(r.day).getDay()+6)%7));if(!map.has(monday))map.set(monday,{first:r.day,last:r.day,count:0,capacity:0,days:0});const w=map.get(monday);w.last=r.day;w.count+=r.count;w.capacity+=r.newCount;w.days+=r.newCount>0?1:0;}return [...map.values()];}
function renderProgress(){
 const start=P.add(today,-6),events=qs.flatMap(q=>(state.history[q.id]?.attempts||[]).map(e=>({...e,subject:q.subject}))).filter(e=>{const d=P.day(new Date(e.at));return d>=start&&d<=today;});
 $('progress').innerHTML=`${renderGoalProgress(true)}<div class="panel"><p class="eyebrow">PROGRESS, NOT PRESSURE</p><h2>「解いた」と「理解した」を別々に。</h2><p class="muted">累計の進捗に加えて、最近7日間の解答結果で定着を確認します。記録に日時がない場合、推測で補いません。</p><div class="tablewrap"><table><thead><tr><th>科目</th><th>一周の進捗</th><th>直近正答率</th><th>最近7日間の解答</th><th>目標まで</th></tr></thead><tbody>${P.stats(qs,state.history).map(s=>{const es=events.filter(e=>e.subject===s.subject),ok=es.filter(e=>e.ok).length;return `<tr><td>${short(s.subject)}</td><td>${s.done}/${s.total}問</td><td>${pct(s.rate)}</td><td>${es.length?Math.round(ok/es.length*100)+'%（'+ok+'/'+es.length+'回）':'日時付き記録なし'}</td><td>${s.rate===null?'未測定':s.rate*100>=state.config.target?'目標到達':(state.config.target-s.rate*100).toFixed(1)+'ポイント'}</td></tr>`;}).join('')}</tbody></table></div><p class="hint" style="margin-top:15px">最近7日間は解答回数で集計。同じ問題の再解答を含みます。時間を空けた確認テストと併用し、正答率だけで理解を判断しないようにします。</p></div><div class="panel"><h2>弱点から、教科書へ</h2><p class="hint">主テーマの直近正答率が低い順。演習済みが少ないテーマは数値が変動しやすいため、問題数も確認してください。</p>${topicRows().slice(0,20).map(t=>`<div class="topic"><div class="subjectline"><strong>${esc(t.title)}</strong><b>${pct(t.rate)}</b></div><p class="hint">演習済み ${t.done}問 · 直近誤答 ${t.wrong.length}問</p><div class="actions"><button data-book="${esc(t.id)}">教科書を読む</button><button data-weak="${esc(t.id)}">誤答を解き直す</button></div></div>`).join('')||'<p class="empty">誤答したテーマはまだありません。</p>'}</div>`;
 bindGoal();bindBooks();document.querySelectorAll('[data-weak]').forEach(e=>e.onclick=()=>{const t=topicRows().find(t=>t.id===e.dataset.weak);startPractice({title:t.title,ids:t.wrong,mode:'review'});});
}
function renderSettings(){$('configFields').innerHTML=fields.map(([k,label,type,min,max,step])=>`<label class="field"><span>${label}</span><input name="${k}" type="${type}" value="${state.config[k]}" required ${type==='number'?`min="${min}" max="${max}" step="${step}"`:''}></label>`).join('');}
function dialog(label,html){$('detailLabel').textContent=label;$('detailBody').innerHTML=html;if(!$('detail').open)$('detail').showModal();}
function readBook(id){if(state.source==='app'){launchApp({topicId:id,ids:[]});return;}const t=book.topics.find(t=>t.id===id),c=book.content[id];if(!t)return;
 dialog('教科書 · 文章と表のプレビュー',`<div class="reading"><h2>${esc(t.title)}</h2><p>${esc(c?.intro||'本文がありません。')}</p>${(c?.sections||[]).map(s=>`<h3>${esc(s.title)}</h3>${(s.paragraphs||[]).map(p=>`<p>${esc(p)}</p>`).join('')}${s.formula?`<div class="note">${esc(s.formula)}</div>`:''}${s.table?`<div class="tablewrap"><table><thead><tr>${(s.table.headers||[]).map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(s.table.rows||[]).map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}`).join('')}<p class="hint">図・計算ガイドは本番アプリの教科書で確認できます。</p><a target="_blank" rel="noopener" href="../index.html">学習アプリを開く ↗</a></div>`);
}
let session=null;
function startPractice(task){if(state.source==='app'){launchApp(task);return;}session={task,list:task.ids.slice(),index:0,correct:0,attempted:0,answered:false};showQuestion();}
function showQuestion(){
 if(session.index>=session.list.length){dialog('演習完了',`<h2>おつかれさまでした。</h2><p>解答 ${session.attempted}問中 ${session.correct}問正解。スキップ ${session.list.length-session.attempted}問。</p><p class="hint">${session.task.mode==='prediction'?'予想問題は過去問の履歴に加算していません。':'解答は試作品内に保存しました。'}予定のチェックは自分で付けてください。本番アプリの学習履歴には反映しません。</p><button id="finishPractice" class="primary">予定に戻る</button>`);$('finishPractice').onclick=()=>{$('detail').close();render();};return;}
 const q=session.list[session.index];session.answered=false;
 dialog(`試作品内の演習 · ${session.index+1}/${session.list.length}問`, `<div class="practicebar"><span class="badge">${esc(short(q.subject))}</span><span class="hint">${esc(q.year)} ${esc(q.number)}</span></div><h3>${esc(session.task.title)}</h3><p class="questiontext">${esc(q.question)}</p>${book.figures?.[q.id]?`<img class="questionfigure" src="${esc('../'+book.figures[q.id])}" alt="${esc(q.number)}の問題図">`:''}<div id="choices">${(q.choices||[]).map((s,i)=>`<button class="choice" data-answer="${i+1}">${i+1}. ${esc(s)}</button>`).join('')}</div><div id="feedback" role="status"></div><div class="actions" style="margin-top:20px"><button id="skipQuestion" class="quiet">スキップ（記録しない）</button><button id="nextQuestion" class="primary" hidden>次へ →</button></div>`);
 document.querySelectorAll('[data-answer]').forEach(e=>e.onclick=()=>answer(Number(e.dataset.answer)));
 $('skipQuestion').onclick=()=>{session.index++;showQuestion();};$('nextQuestion').onclick=()=>{session.index++;showQuestion();};
}
function answer(value){
 if(session.answered)return;session.answered=true;
 const q=session.list[session.index],ok=value===q.answer;session.attempted++;if(ok)session.correct++;
 if(session.task.mode!=='prediction'){
  const h=state.history[q.id]||{n:0,ok:0,attempts:[]};h.n++;h.ok+=ok?1:0;h.lastOk=ok;h.attempts=h.attempts||[];h.attempts.push({at:Date.now(),ok});h.review={due:P.add(today,ok?3:1)};state.history[q.id]=h;save();
 }
 document.querySelectorAll('[data-answer]').forEach(e=>{e.disabled=true;if(+e.dataset.answer===q.answer)e.classList.add('correct');else if(+e.dataset.answer===value)e.classList.add('wrong');});
 $('feedback').innerHTML=`<div class="note ${ok?'':'warning'}" style="margin-top:15px"><strong>${ok?'正解です':'正答は '+q.answer+' です'}</strong></div><p class="questiontext">${esc(q.explanation||'')}</p><p class="hint">${session.task.mode==='prediction'?'予想問題は過去問の進捗に加算しません。':'試作品内の履歴に保存しました。'}</p>`;
 $('nextQuestion').hidden=false;$('skipQuestion').hidden=true;
}
document.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>switchTab(e.dataset.tab));
$('settingsShortcut').onclick=()=>switchTab('settings');$('closeDialog').onclick=()=>{$('detail').close();render();};$('detail').addEventListener('close',()=>render());
$('configForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),c={...state.config};fields.forEach(([k,,t])=>c[k]=t==='number'?Number(fd.get(k)):fd.get(k));const error=P.validate(c);if(error){tell(error);return;}state.config=c;save();render();tell('計画を保存しました。設定した目標問題数で残りの問題を再配分しました。');};
$('exportPlan').onclick=()=>{const blob=new Blob([JSON.stringify({kind:'study-schedule-prototype',version:1,state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`学習計画_${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('計画を書き出しました。');};
window.addEventListener('storage',e=>{if(e.key===DriveStudyCore.ACTIVE){location.reload();return;}if(e.key===appStorage.key(APP_HISTORY)||e.key===null)resumeSync();if(e.key===KEY)reloadPlan();});
window.addEventListener('focus',resumeSync);window.addEventListener('pageshow',resumeSync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeSync();});
$('autoSyncButton').onclick=()=>{if(state.source!=='app')state.goal=null;state.source='app';readAppHistory();save(false);render();tell('アプリとの自動連動を有効にしました。学習記録をもとに目標と実績を更新します。');};
async function init(){try{
 [qs,predictions,book]=await Promise.all(['questions','predictions','meta'].map(async n=>{const r=await fetch(`../data/${n}.json`);if(!r.ok)throw Error('データの読込に失敗しました');return r.json();}));
 book={...book.textbook,figures:book.figures};
 qs=qs.filter(q=>q.kind!=='prediction'&&q.answer!=null);
 let raw;try{raw=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
 if(raw?.config&&!P.validate({...structuredClone(P.defaults),...raw.config})){state={...state,...raw,config:{...structuredClone(P.defaults),...raw.config},history:P.normalize(raw.history,qs),goal:validGoal(raw.goal)?raw.goal:null};}
 else{let legacy;try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');}catch(e){}if(!appStorage.owner&&legacy?.config&&!P.validate({...structuredClone(P.defaults),...legacy.config})){state.config={...structuredClone(P.defaults),...legacy.config};state.checks=legacy.checks||{};state.notes=legacy.notes||{};}state.source='app';state.goal=null;readAppHistory();save(false);}
 if(state.source==='app'&&!state._syncAt&&JSON.stringify(state.config)!==JSON.stringify(P.defaults)){state._syncAt=1;state._syncActor='legacy-plan';save(false);}
 if(state.source!=='app'){state.source='app';state.goal=null;readAppHistory();save(false);}
 $('loading').hidden=true;render();window.dispatchEvent(new Event('schedule-ready'));
 }catch(e){$('loading').innerHTML=`<h2>読み込めませんでした</h2><p>ローカルサーバーからこのページを開いてください。</p><p>${esc(e.message)}</p><button onclick="location.reload()">再読み込み</button>`;}}
init();
