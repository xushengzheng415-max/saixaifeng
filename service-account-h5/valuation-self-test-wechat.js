(()=>{'use strict';
  const API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi';
  const stage=document.getElementById('next-stage');if(!stage)return;
  const inWechat=/MicroMessenger/i.test(navigator.userAgent);
  let sdkReady=false;
  function launchButton(slot,path,label){
    if(slot.querySelector('wx-open-launch-weapp'))return;
    const launch=document.createElement('wx-open-launch-weapp');
    launch.setAttribute('username','gh_d58816f3de7c');
    launch.setAttribute('path',path);
    launch.innerHTML=`<template><style>button{display:block;width:100%;height:48px;border:0;border-radius:8px;background:#087344;color:#fff;font:700 17px sans-serif}</style><button>${label}</button></template>`;
    launch.addEventListener('error',()=>{const status=slot.querySelector('p');if(status)status.textContent='打开失败，请在微信搜索“赛小蜂足球”小程序。'});
    slot.append(launch);
    return launch;
  }
  let rendering=false;
  function setStatus(element,text){
    if(element&&element.textContent!==text)element.textContent=text;
  }
  function render(){
    if(rendering)return;
    rendering=true;
    try{
      const register=stage.querySelector('#register-mini-slot');
      if(register&&!register.querySelector('wx-open-launch-weapp')){
        const status=register.querySelector('#register-mini-status');
        if(!sdkReady){setStatus(status,'请在微信中打开本页。登记完成后，可直接去小程序创建球队。')}
        else{
          // 注册在服务号自助登记页完成，这里只承接“建队”这一步。
          setStatus(status,'登记完成后，用同一个手机号登录小程序创建球队。');
          const launch=launchButton(register,'pages/onboarding/onboarding?step=team&from=selftest','去小程序创建球队');
          launch?.addEventListener('launch',()=>{
            const sessionId=localStorage.getItem('sxf-valuation-selftest-session-v1');if(!sessionId)return;
            fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketingSelfTestEvent',eventType:'mini_create_intent',sessionId}),keepalive:true}).catch(()=>{});
          });
        }
      }
      const old=stage.querySelector('#mini-create-team');
      if(old){
        const name=stage.querySelector('#mini-team-name'),error=stage.querySelector('#mini-create-error');
        if(name)name.hidden=true;
        old.hidden=true;
        setStatus(error,sdkReady?'':'请在微信中打开本页，再进入“赛小蜂足球”小程序创建球队。');
        if(sdkReady){
          const launch=launchButton(old.parentElement,'pages/onboarding/onboarding?step=team&from=selftest','打开小程序创建球队');
          launch?.addEventListener('launch',()=>{
            const sessionId=localStorage.getItem('sxf-valuation-selftest-session-v1');if(!sessionId)return;
            fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketingSelfTestEvent',eventType:'mini_create_intent',sessionId}),keepalive:true}).catch(()=>{});
          });
        }
      }
    }finally{rendering=false}
  }
  // 只监听 stage 自身的子节点替换（视图切换），不监听内部文本写入，避免 render 触发自身再次 render 造成死循环。
  new MutationObserver(render).observe(stage,{childList:true});
  if(!inWechat||!window.wx){render();return}
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'marketingSelfTestWxConfig',url:location.href.split('#')[0]})})
    .then(response=>response.json()).then(result=>{
      if(!result.success||!result.jsConfig)throw Error('签名不可用');
      wx.config({...result.jsConfig,debug:false,jsApiList:[],openTagList:['wx-open-launch-weapp']});
      wx.ready(()=>{sdkReady=true;render()});
      wx.error(()=>render());
    }).catch(()=>render());
})();
