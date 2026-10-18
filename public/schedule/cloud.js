/* OAuth tokens stay in memory. This page syncs plans, never rewrites app answers. */
(function(){
 'use strict';
 const C=window.DriveStudyCore,S=window.ScheduleSync,raw=window.localStorage,owner=raw.getItem(C.ACTIVE)||'',actor=crypto.randomUUID();
 const fileKey='gijutsushi_plan_drive_file:'+owner;
 let token='',expires=0,busy=false,again=false,client=null,fileId=raw.getItem(fileKey)||null,timer=null,ready=false;
 const scope='https://www.googleapis.com/auth/drive.appdata',status=s=>{document.getElementById('cloudStatus').textContent=s;};
 const guard=()=>{if((raw.getItem(C.ACTIVE)||'')!==owner)throw Error('アカウントが変更されました。再読み込みしてください。');};
 async function request(url,options={}){
  guard();if(!token||Date.now()>=expires)throw Error('Google接続の有効期限が切れました。同期ボタンで再接続してください。');
  const r=await fetch(url,{...options,cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
  if(r.status===401){token='';throw Error('Googleへ再接続してください。');}if(!r.ok)throw Error('Google Driveとの通信に失敗しました（'+r.status+'）。');
  if(Number(r.headers.get('content-length'))>20*1024*1024)throw Error('同期データが大きすぎます。');
  const text=await r.text();if(text.length>20*1024*1024)throw Error('同期データが大きすぎます。');return text?JSON.parse(text):{};
 }
 async function sync(){
  if(!ready||!token)return;if(busy){again=true;return;}if(navigator.onLine===false){status('オフラインです。変更は端末内に保存済みです。');return;}
  busy=true;status('アカウントの目標・計画を同期しています…');
  try{
   let page='',count=0,records=[];
   do{
    const p=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='app' and value='gijutsushi-sync-v1' }",fields:'nextPageToken,files(id,size)',pageSize:'100'});if(page)p.set('pageToken',page);
    const result=await request('https://www.googleapis.com/drive/v3/files?'+p);
    for(const file of result.files||[]){if(++count>500||Number(file.size)>20*1024*1024)throw Error('同期データが大きすぎます。');const doc=C.validate(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media'),owner);const r=doc.fields.schedule?.plan;if(r&&S.valid(r.value))records.push(r);}
    page=result.nextPageToken||'';
   }while(page);
   // Capture local edits after downloads, so a pending edit cannot be lost.
   const local=S.capture(raw,owner).plan;if(local)records.push(local);records.sort(C.compare);const winner=records.at(-1);
   guard();if(winner){if(S.apply(raw,owner,winner))window.dispatchEvent(new Event('schedule-cloud-applied'));
    const doc=C.empty(owner);doc.fields.schedule.plan=winner;const body=JSON.stringify(doc);
    if(fileId)await request('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body});
    else{const boundary='plan_'+actor,meta={name:'study-plan-'+actor+'.json',parents:['appDataFolder'],appProperties:{app:'gijutsushi-sync-v1'}};const payload='--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--';const result=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:payload});if(typeof result.id!=='string')throw Error('保存先を確認できませんでした。');fileId=result.id;raw.setItem(fileKey,fileId);}
   }
   status(winner?'目標・計画はアカウントと同期済み（'+new Date().toLocaleTimeString('ja-JP')+'）。接続中は自動同期します。':'接続済みです。目標問題数や計画を保存すると、このアカウントへ自動同期します。');
  }catch(e){status('同期できませんでした。端末内の設定は残っています。'+e.message);}finally{busy=false;if(again){again=false;queue();}}
 }
 function queue(){clearTimeout(timer);timer=setTimeout(sync,1200);if(!token)status('変更は端末内に保存済みです。同期ボタンでGoogleへ接続してください。');}
 async function authorized(response){
  try{
   if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,scope,'openid','email'))throw Error('同期の許可を確認できませんでした。');
   const seconds=Number(response.expires_in);if(!Number.isFinite(seconds)||seconds<=60)throw Error('接続の有効期限を確認できませんでした。');
   token=response.access_token;expires=Date.now()+(seconds-60)*1000;const user=await request('https://www.googleapis.com/oauth2/v3/userinfo');
   if(user.sub!==owner||!user.email_verified){token='';throw Error('学習アプリと同じGoogleアカウントを選択してください。');}await sync();
  }catch(e){token='';status(e.message);}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('cloudConnect');
  b.onclick=()=>{if(!owner){status('先に学習アプリの「記録」でGoogleアカウントを接続してください。');return;}if(token&&Date.now()<expires){sync();return;}if(!client){status('接続の準備中です。少し待ってもう一度押してください。');return;}client.requestAccessToken({prompt:''});};
  if(!owner){status('目標・計画の端末間同期には、学習アプリでGoogleアカウントを接続してください。');return;}
  status('このアカウントの目標・計画を引き継ぐには、同期ボタンでGoogleへ接続してください。');
  if(!window.SCHEDULE_DRIVE_CLIENT_ID){status('Google接続が未設定です。目標は端末内に保存されます。');return;}
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{client=google.accounts.oauth2.initTokenClient({client_id:window.SCHEDULE_DRIVE_CLIENT_ID,scope:scope+' openid email',include_granted_scopes:false,callback:authorized,error_callback:()=>status('接続画面が閉じられました。同期ボタンで再接続できます。')});};script.onerror=()=>status('Google接続を読み込めません。通信を確認して再読み込みしてください。');document.head.appendChild(script);
 });
 window.addEventListener('schedule-ready',()=>{ready=true;if(token)sync();});window.addEventListener('schedule-plan-change',queue);
 window.addEventListener('focus',()=>{if(token)sync();});window.addEventListener('online',()=>{if(token)sync();});
 window.addEventListener('storage',e=>{if(e.key===S.key(owner))queue();if(e.key===C.ACTIVE){token='';location.reload();}});
 setInterval(()=>{if(token&&!document.hidden)sync();},60000);
})();
