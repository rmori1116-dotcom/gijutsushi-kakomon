'use strict';
const P=Planner,$=id=>document.getElementById(id),LEGACY_KEY='gijutsushi_schedule_prototype_v1';
const appStorage=DriveStudyCore.storage(window.localStorage),APP_HISTORY='gijutsushi_r7_history_v1',KEY=appStorage.owner?'gijutsushi_schedule_v2:'+appStorage.owner:'gijutsushi_schedule_v2:local';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>s==='専門科目(建設部門)'?'建設部門':s;
const fmt=d=>`${+d.slice(5,7)}/${+d.slice(8)}（${'日月火水木金土'[P.date(d).getDay()]}）`;
const pct=n=>n===null?'未測定':Math.round(n*100)+'%';
let today=P.day(new Date()),selected=today,weekStart=today,tab='today',qs=[],predictions=[],book={},model;
let state={config:structuredClone(P.defaults),source:'app',history:{},goal:null,checks:{},notes:{}};
let settingsDirty=false;
function tell(s){$('notice').textContent=s;}
function save(changed=true){try{if(changed){state._syncAt=Date.now();state._syncActor=crypto.randomUUID();}localStorage.setItem(KEY,JSON.stringify(state));if(changed)window.dispatchEvent(new Event('schedule-plan-change'));return true;}catch(e){tell('保存できませんでした。ブラウザーの空き容量を確認してください。');return false;}}
function readAppHistory(){if((window.localStorage.getItem(DriveStudyCore.ACTIVE)||'')!==appStorage.owner){location.reload();return;}state.history=P.normalize(JSON.parse(appStorage.getItem(APP_HISTORY)||'{}'),qs);}
function launchApp(task){const token=crypto.randomUUID();try{sessionStorage.setItem('gijutsushi_schedule_launch:'+token,JSON.stringify({owner:appStorage.owner,at:Date.now(),ids:task.ids.map(q=>q.id),topicId:task.topicId||null}));location.href='../index.html?scheduleTask='+encodeURIComponent(token);}catch(e){tell('アプリを開けませんでした。ブラウザーの保存設定を確認してください。');}}
function startPractice(task){if(state.source==='app'){launchApp(task);return;}}
function validGoal(g){return !!g&&Number.isFinite(g.createdAt)&&Number.isFinite(g.remaining)&&P.validDay(g.start)&&P.validDay(g.finish)&&g.baseline&&Array.isArray(g.rows);}
function reloadPlan(){if(tab==='settings'&&settingsDirty){tell('別の端末の設定が届いています。入力中の内容はそのままです。保存すると入力した目標を使います。');return;}try{const next=JSON.parse(localStorage.getItem(KEY)||'null');if(next?.config&&!P.validate(next.config)){state={...state,...next,source:'app',history:state.history,goal:validGoal(next.goal)?next.goal:null};render();}}catch(e){tell('同期した設定を読み込めませんでした。再読み込みしてください。');}}
function render(){
 const now=P.day(new Date());if(now!==today){if(selected===today)selected=now;today=now;}
 if(state.source==='app')readAppHistory();
 const done=P.activity(qs,state.history,today,today);model=P.plan(qs,state.history,state.config,today,done.fresh);
 document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==tab);
 document.querySelectorAll('[data-tab]').forEach(e=>{e.classList.toggle('active',e.dataset.tab===tab);if(e.dataset.tab===tab)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
 $('sourceLabel').textContent='解答の記録は過去問アプリと自動連動しています。';
 if(tab==='today')renderToday();if(tab==='calendar')renderWeek();if(tab==='progress')renderProgress();if(tab==='settings')renderSettings();
}
function switchTab(name){tab=name;render();}
function meter(done,goal){return `<div class="meter" role="progressbar" aria-label="目標の達成率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal?Math.min(100,Math.round(done/goal*100)):0}"><i style="width:${goal?Math.min(100,done/goal*100):0}%"></i></div>`;}
function dayName(d){return d===today?'今日':d===P.add(today,-1)?'昨日':d===P.add(today,1)?'明日':fmt(d);}
function targetCard(kind,actual,target,available){
 const fresh=kind==='fresh',left=Math.max(0,target-actual);
 const message=!target?'この日は目標を設定していません':left===0?'目標を達成しました':fresh&&model.remaining===0?'すべての過去問を学習済みです':!fresh&&available===0?'今は復習が必要な問題はありません':`目標まで あと ${left}問`;
 return `<article class="dailycard ${fresh?'freshcard':'reviewcard'}"><div class="cardlabel"><span class="numberIcon">${fresh?'1':'2'}</span><h3>${fresh?'初めて解く問題':'解き直して復習する問題'}</h3></div><div class="scoreline"><strong>${actual}</strong><span>問 解いた</span><span class="targetnumber">目標 <b>${target}</b>問</span></div>${meter(actual,target)}<p class="statusline ${left===0&&target?'complete':''}">${message}</p><p class="hint">${fresh?'同じ問題を繰り返し解いても、新規には加算しません。':'同じ日の同じ問題の解き直しは、1問として数えます。'}</p></article>`;
}
function tasks(){
 const c=state.config,targets=P.targets(c,selected,selected),actual=P.activity(qs,state.history,selected,selected);
 if(selected===c.prediction)return [{id:'prediction',title:'予想問題で仕上げる',text:'過去問の進捗とは別に、予想問題を演習します。',ids:predictions.filter(q=>q.answer!=null),kind:'prediction'}];
 if(selected===c.final)return [{id:'final',title:'試験前の弱点チェック',text:'間違えた問題と教科書を中心に確認しましょう。',ids:P.review(qs,state.history,selected).slice(0,15),kind:'review'}];
 if(!targets.rows.length||P.dayType(selected,c)==='rest'||selected<today)return [];
 const reviewed=new Set(actual.reviewIds),review=P.review(qs,state.history,selected).filter(q=>!reviewed.has(q.id));
 const remaining=Math.max(0,targets.fresh-actual.fresh),suggestions=P.suggestThemes(qs,state.history,book.topics,Math.min(model.remaining,remaining));
 const out=suggestions.map(g=>({id:'theme-'+g.topic.id,title:g.topic.title,text:`${short(g.questions[0].subject)} · ${g.untouched?'まだ解いていないテーマ':'残っている未演習問題'}${g.questions.length<g.totalPending?' · 今回は一部を学習':''}`,ids:g.questions,topicId:g.topic.id,kind:'fresh'}));
 const count=Math.min(review.length,Math.max(0,targets.reviews-actual.reviews));
 if(count)out.push({id:'review',title:'復習が必要な問題を解き直す',text:review.length<targets.reviews?'対象の問題数が目標より少ないため、今日は対象分だけ復習しましょう。':'復習日が来た問題と、前回の誤答を優先します。',ids:review.slice(0,count),kind:'review'});
 return out;
}
function renderToday(){
 const c=state.config,t=P.targets(c,selected,selected),a=P.activity(qs,state.history,selected,selected),entries=tasks(),available=P.review(qs,state.history,selected).length;
 const off=P.dayType(selected,c)==='rest',active=selected>=c.start&&selected<=c.finish;
 const special=selected===c.exam?'本試験です。受験票・会場・持ち物を確認しましょう。':selected===c.prediction?'予想問題を解く日です。':selected===c.final?'試験前の最終確認の日です。':selected<c.start?'計画の開始前です。目標の設定や教科書の確認に使いましょう。':selected>c.finish?'通常の過去問計画の期間外です。':off?'この日はお休みです。新規・復習の目標は0問です。':'';
 const fresh=entries.filter(e=>e.kind==='fresh'),reviews=entries.filter(e=>e.kind!=='fresh');
 const card=e=>`<article class="theme"><div class="themebody"><span class="pill ${e.kind==='fresh'?'':'orange'}">${e.kind==='fresh'?'新規学習':'復習・仕上げ'}</span><h3>${esc(e.title)}</h3><p class="muted">${esc(e.text)}</p><div class="themefoot"><strong>${e.kind==='fresh'?'約':''}${e.ids.length}<small>問</small></strong><div class="actions">${e.topicId?`<button data-book="${esc(e.topicId)}" class="quiet">教科書を読む</button>`:''}<button data-task="${esc(e.id)}" class="primary" ${e.ids.length?'':'disabled'}>${e.kind==='fresh'?'このテーマを解く':'復習を始める'} →</button></div></div></div></article>`;
 $('today').innerHTML=`<div class="daytoolbar"><div><p class="eyebrow">${selected===today?'TODAY':'DAILY PLAN'}</p><h2>${dayName(selected)}の学習 <span>${fmt(selected)}</span></h2></div><div class="datecontrols"><label for="selectedDate">学習する日</label><input type="date" id="selectedDate" value="${selected}">${selected!==today?'<button id="backToday" class="quiet">今日に戻る</button>':''}</div></div>
 ${special?`<div class="noticebox">${special}</div>`:''}
 <div class="dailygrid">${targetCard('fresh',a.fresh,t.fresh,model.remaining)}${targetCard('review',a.reviews,t.reviews,available)}</div>
 <p class="definition">目標は「目標の設定」の${off?'お休み':P.dayType(selected,c)==='holiday'?'休日':'平日'}の問題数です。解答すると自動で更新されます。<button class="linkbutton" id="editDaily">目標を変更する</button></p>
 ${selected<today?'<div class="panel"><h2>この日の実績を表示しています</h2><p class="muted">演習を始めると、実際に解いた日付に記録されます。「今日に戻る」から学習を続けられます。</p></div>':`<section class="learningsection"><div class="sectionhead"><div><h2>${selected===today?'次に取り組むテーマ':'この日の学習候補'}</h2><p class="muted">${selected===today?'テーマごとに学び、教科書で理解を深めましょう。':'現在の学習記録をもとにした候補です。当日の進捗で変わります。'}</p></div></div>${fresh.length?`<p class="sectionnote">新規の提案は合計 約${fresh.reduce((n,e)=>n+e.ids.length,0)}問。テーマのまとまりを優先するため、残りの目標問題数と多少前後します。</p>${fresh.map(card).join('')}`:active&&!off?'<div class="emptycard"><strong>今から取り組む新規テーマはありません</strong><p>この日の目標を達成したか、未演習の問題がなくなっています。</p></div>':''}${reviews.map(card).join('')}</section>`}
 <details class="help"><summary>この日の予定を変更・メモする</summary><div class="formgrid"><label class="field"><span>平日・休日・お休み</span><select id="dayType"><option value="auto">自動（土日は休日）</option><option value="weekday">平日の問題数で学ぶ</option><option value="holiday">休日の問題数で学ぶ</option><option value="rest">お休みにする</option></select></label><label class="field"><span>学習メモ</span><textarea id="dailyNote" rows="3" placeholder="次に確認したいことなど">${esc(state.notes[selected]||'')}</textarea></label></div><button id="saveDay" class="quiet">この日の予定とメモを保存</button></details>
 <details class="help"><summary>数字の数え方を確認する</summary><p>新規は「初めて解いた日」に1問、復習はその後に解き直した日ごとに1問です。正解・不正解にかかわらず数えます。解答日時が記録されていない古い履歴は、日別の実績には加えず「全体の進み具合」に含めます。</p><p>復習の対象が目標より少ない日は、対象分だけ解けば大丈夫です。目標の数字自体は、設定した値を表示します。</p></details>`;
 $('selectedDate').onchange=e=>{if(P.validDay(e.target.value)){selected=e.target.value;render();}};
 if($('backToday'))$('backToday').onclick=()=>{selected=today;render();};$('editDaily').onclick=()=>switchTab('settings');
 $('dayType').value=c.overrides[selected]||'auto';$('saveDay').onclick=()=>{const type=$('dayType').value;if(type==='auto')delete c.overrides[selected];else c.overrides[selected]=type;state.notes[selected]=$('dailyNote').value;if(save()){render();tell('この日の予定とメモを保存しました。');}};
 document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>startPractice(entries.find(e=>e.id===b.dataset.task)));bindBooks();
}
function bindBooks(){document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>launchApp({ids:[],topicId:b.dataset.book}));}
function renderWeek(){
 const start=P.add(weekStart,-((P.date(weekStart).getDay()+6)%7)),end=P.add(start,6),t=P.targets(state.config,start,end),a=P.activity(qs,state.history,start,end);
 const title=today>=start&&today<=end?'今週の進み具合':'1週間の進み具合';
 $('calendar').innerHTML=`<div class="sectionhead"><div><p class="eyebrow">WEEKLY PLAN</p><h2>${title}</h2><p class="muted">${fmt(start)} 〜 ${fmt(end)}</p></div><div class="actions"><button id="prevWeek" class="quiet">← 前の週</button><button id="thisWeek" class="quiet">今週</button><button id="nextWeek" class="quiet">次の週 →</button></div></div><div class="dailygrid">${targetCard('fresh',a.fresh,t.fresh,model.remaining)}${targetCard('review',a.reviews,t.reviews,1)}</div><p class="definition">1週間の目標は、現在の設定で各日の目標を合計した問題数です。途中の週は、週末までの目標に対する進捗です。</p><div class="panel"><h2>日ごとの予定と実績</h2><p class="muted">日付を押すと、その日の学習を確認できます。</p><div class="tablewrap"><table><thead><tr><th>日付</th><th>初めて解く問題<br><small>実績 / 目標</small></th><th>復習する問題<br><small>実績 / 目標</small></th></tr></thead><tbody>${P.days(start,end).map(d=>{const goal=P.targets(state.config,d,d),actual=P.activity(qs,state.history,d,d);return `<tr class="${d===today?'todayrow':''}"><td><button class="datelink" data-day="${d}">${fmt(d)} ${d===today?'<span class="pill">今日</span>':''}</button>${P.dayType(d,state.config)==='rest'?'<small>お休み</small>':''}</td><td><b>${actual.fresh}</b> / ${goal.fresh}問</td><td><b>${actual.reviews}</b> / ${goal.reviews}問</td></tr>`;}).join('')}</tbody></table></div></div><div class="panel"><h2>試験までの流れ</h2><ol class="milestones"><li><b>${fmt(state.config.finish)}まで</b><span>過去問を一通り解く</span></li><li><b>${fmt(state.config.prediction)}</b><span>予想問題で実力を確認</span></li><li><b>${fmt(state.config.final)}</b><span>弱点を最終確認</span></li><li><b>${fmt(state.config.exam)}</b><span>本試験</span></li></ol></div>`;
 $('prevWeek').onclick=()=>{weekStart=P.add(start,-7);render();};$('nextWeek').onclick=()=>{weekStart=P.add(start,7);render();};$('thisWeek').onclick=()=>{weekStart=today;render();};document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selected=b.dataset.day;switchTab('today');window.scrollTo(0,0);});
}
function topicRows(){return book.topics.map(topic=>{const done=qs.filter(q=>q.topicId===topic.id&&state.history[q.id]?.n&&typeof state.history[q.id].lastOk==='boolean');return {...topic,done:done.length,rate:done.length?done.filter(q=>state.history[q.id].lastOk).length/done.length:null,wrong:done.filter(q=>state.history[q.id].lastOk===false)};}).filter(t=>t.wrong.length).sort((a,b)=>a.rate-b.rate||b.done-a.done);}
function renderProgress(){
 const stats=P.stats(qs,state.history),total=stats.reduce((n,s)=>n+s.total,0),done=total-model.remaining;
 const upcoming=model.rows.findLast?model.rows.findLast(r=>r.count>0):model.rows.filter(r=>r.count>0).at(-1);
 const message=model.remaining===0?'過去問を一通り解き終えています。':model.shortfall?`今の問題数では、完了日までに${model.shortfall}問残る見込みです。`:`今の問題数なら、${upcoming?fmt(upcoming.day):fmt(state.config.finish)}ごろに一通り解き終わる見込みです。`;
 $('progress').innerHTML=`<div class="sectionhead"><div><p class="eyebrow">OVERALL PROGRESS</p><h2>過去問を、どこまで解いた？</h2></div></div><div class="panel overall"><div class="overallscore"><strong>${done}</strong><span> / ${total}問を学習済み</span><b>${Math.round(done/total*100)}%</b></div>${meter(done,total)}<p class="muted">一度も解いていない過去問は <strong>${model.remaining}問</strong> です。正解した問題数ではありません。</p><div class="forecast ${model.shortfall?'warning':''}"><strong>${message}</strong><p>完了の目標：${fmt(state.config.finish)}。${model.neededPerDay===null?'残りの学習日がありません。':`残り${model.rows.filter(r=>r.newCount>0).length}日の平均で、新規${model.neededPerDay}問ずつ必要です。`}</p><button id="adjustPace" class="quiet">1日の問題数を見直す</button></div></div><div class="panel"><h2>科目ごとの進み具合</h2><p class="muted">「一度解いた問題数」と「最後の解答の正答率」を分けて表示します。</p><div class="subjectgrid">${stats.map(s=>`<article class="subject"><h3>${short(s.subject)}</h3><p><strong>${s.done}</strong> / ${s.total}問を学習済み</p>${meter(s.done,s.total)}<p class="hint">残り ${s.left}問</p><div class="accuracy"><span>最後の解答の正答率</span><b>${pct(s.rate)}</b></div><p class="hint">${s.correct} / ${s.scored}問が正解 · 目標${state.config.target}%</p></article>`).join('')}</div></div><details class="help"><summary>苦手なテーマを確認する</summary>${topicRows().slice(0,15).map(t=>`<div class="weaktopic"><div><strong>${esc(t.title)}</strong><p class="hint">直近正答率 ${pct(t.rate)} · ${t.done}問を演習済み</p></div><button data-book="${esc(t.id)}" class="quiet">教科書へ</button></div>`).join('')||'<p>まだ苦手テーマの記録はありません。</p>'}</details><p class="hint">公式過去問1,120問のうち採点対象外3問を除く1,117問が対象です。予想問題80問は含みません。</p>`;
 $('adjustPace').onclick=()=>switchTab('settings');bindBooks();
}
const fields=[['weekdayNew','初めて解く問題','number',1,100],['weekdayReview','復習する問題','number',0,50],['holidayNew','初めて解く問題','number',1,150],['holidayReview','復習する問題','number',0,70],['start','学習を始める日','date'],['finish','過去問を一通り終える日','date'],['prediction','予想問題を解く日','date'],['final','最終確認の日','date'],['exam','本試験の日','date'],['target','各科目の目標正答率（%）','number',1,100]];
function renderSettings(){
 settingsDirty=false;
 const field=([key,label,type,min,max])=>`<label class="field"><span>${label}</span><div class="inputunit"><input name="${key}" aria-label="${key.startsWith('weekday')?'平日の':key.startsWith('holiday')?'休日の':''}${label}" type="${type}" value="${esc(state.config[key])}" required ${type==='number'?`min="${min}" max="${max}" step="1"`:''}>${type==='number'?`<b>${key==='target'?'%':'問 / 日'}</b>`:''}</div></label>`;
 $('weekdayFields').innerHTML=fields.filter(f=>f[0].startsWith('weekday')).map(field).join('');$('holidayFields').innerHTML=fields.filter(f=>f[0].startsWith('holiday')).map(field).join('');$('dateFields').innerHTML=fields.filter(f=>['start','finish'].includes(f[0])).map(field).join('');$('otherFields').innerHTML=fields.filter(f=>['prediction','final','exam','target'].includes(f[0])).map(field).join('');
}
$('configForm').addEventListener('input',()=>{settingsDirty=true;});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('settingsShortcut').onclick=()=>switchTab('settings');
$('configForm').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target),config={...state.config};fields.forEach(([key,,type])=>config[key]=type==='number'?Number(data.get(key)):data.get(key));const error=P.validate(config);if(error){tell(error);return;}state.config=config;if(save()){switchTab('today');tell(`保存しました。平日は新規${config.weekdayNew}問・復習${config.weekdayReview}問、休日は新規${config.holidayNew}問・復習${config.holidayReview}問が目標です。`);window.scrollTo(0,0);}};
$('exportPlan').onclick=()=>{const blob=new Blob([JSON.stringify({kind:'study-schedule-prototype',version:1,state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`学習計画_${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('storage',e=>{if(e.key===DriveStudyCore.ACTIVE){location.reload();return;}if(e.key===KEY)reloadPlan();else if(e.key===appStorage.key(APP_HISTORY)||e.key===null)resumeSync();});
function resumeSync(){if(!qs.length)return;try{if(tab==='settings'&&settingsDirty){readAppHistory();return;}render();}catch(e){tell(e.message);}}
window.addEventListener('focus',resumeSync);window.addEventListener('pageshow',resumeSync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeSync();});window.addEventListener('schedule-cloud-applied',reloadPlan);
async function init(){try{
 [qs,predictions,book]=await Promise.all(['questions','predictions','meta'].map(async n=>{const r=await fetch(`../data/${n}.json`);if(!r.ok)throw Error('問題データを読み込めませんでした。');return r.json();}));book=book.textbook;qs=qs.filter(q=>q.kind!=='prediction'&&q.answer!=null);
 let raw;try{raw=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
 if(raw?.config&&!P.validate({...structuredClone(P.defaults),...raw.config})){state={...state,...raw,source:'app',config:{...structuredClone(P.defaults),...raw.config},goal:validGoal(raw.goal)?raw.goal:null};}
 else{let legacy;try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');}catch(e){}if(!appStorage.owner&&legacy?.config&&!P.validate({...structuredClone(P.defaults),...legacy.config})){state.config={...structuredClone(P.defaults),...legacy.config};state.notes=legacy.notes||{};}state.source='app';state.goal=null;readAppHistory();save(false);}
 if(!state._syncAt&&JSON.stringify(state.config)!==JSON.stringify(P.defaults)){state._syncAt=1;state._syncActor='legacy-plan';save(false);}
 $('loading').hidden=true;render();window.dispatchEvent(new Event('schedule-ready'));
 }catch(e){$('loading').innerHTML=`<h2>読み込めませんでした</h2><p>${esc(e.message)}</p><button onclick="location.reload()">もう一度読み込む</button>`;}}
init();
