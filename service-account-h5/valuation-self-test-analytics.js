(()=>{'use strict';
  const API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi';
  const key='sxf-valuation-selftest-session-v1';
  let sessionId='';
  try{sessionId=localStorage.getItem(key)||'';if(!/^[0-9a-f-]{36}$/i.test(sessionId)){sessionId=crypto.randomUUID();localStorage.setItem(key,sessionId)}}catch{sessionId=crypto.randomUUID()}
  function send(eventType,answers){
    const payload={action:'marketingSelfTestEvent',eventType,sessionId};if(answers)payload.answers=answers;
    fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
  }
  function answers(){
    const get=id=>document.getElementById(id)?.value||'';
    return{ageGroup:Number(get('age'))<18?'minor':'adult',position:get('position'),competitionTypes:get('competitionTypes').split('|').filter(Boolean),matchFormat:get('matchFormat'),friendlyFormat:get('friendlyFormat')};
  }
  send('view');
  if(new URLSearchParams(location.search).has('share'))send('referral_open');
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.id==='wizard-start')send('start');
    if(target.id==='share')send('share');
    if(target.textContent?.trim()==='保存并提升身价' || target.dataset.action==='register')send('register_intent');
  },true);
  const result=document.getElementById('result-stage');
  new MutationObserver(()=>{if(!result.hidden)send('complete',answers())}).observe(result,{attributes:true,attributeFilter:['hidden']});
})();
