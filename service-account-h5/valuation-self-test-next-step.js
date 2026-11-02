(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const result=$('result-stage');
  const actions=result.querySelector('.buttons');
  const oldPlatform=result.querySelector('.platform');
  const nextStage=document.createElement('section');
  nextStage.id='next-stage';
  nextStage.className='next-stage';
  nextStage.hidden=true;
  document.querySelector('.main').append(nextStage);
  const dialog=document.createElement('dialog');
  dialog.className='play-dialog';
  dialog.innerHTML='<h2>我觉得你有球星潜质。要不要把接下来的比赛也记下来？</h2><p>注册后，你可以认领自己的球员卡；以后参加的比赛经过核实，会留在生涯档案里。</p><div class="dialog-actions"><button type="button" class="primary" data-action="register">保存并提升身价</button><button type="button" class="secondary" data-action="exit">暂时不用，退出</button></div>';
  document.body.append(dialog);
  const platform=document.createElement('div');
  platform.className='platform-purpose';
  platform.innerHTML='<h2>来到赛小蜂足球，可以做什么？</h2><p>主办方办比赛，球队管报名和队员；球员留下自己的比赛履历、球员卡。核实后的比赛数据会参与正式身价评估。</p><div class="purpose-points"><span>记录比赛</span><span>认领球员卡</span><span>找到队友</span></div>';
  oldPlatform.replaceWith(platform);
  oldPlatform.hidden=true;
  document.querySelector('.main').append(oldPlatform);
  const continueBtn=document.createElement('button');
  continueBtn.type='button';
  continueBtn.className='primary';
  continueBtn.textContent='保存并提升身价';
  const playBtn=document.createElement('button');
  playBtn.type='button';
  playBtn.className='secondary';
  playBtn.textContent='我只是玩玩';
  const note=document.createElement('p');
  note.className='action-note';
  note.textContent='保存自测卡；之后让核实的比赛记录参与重新评估。';
  const shareActions=document.createElement('div');
  shareActions.className='share-actions';
  const share=$('share'),save=$('save'),again=$('again');
  share.className='secondary';
  share.textContent='分享给球友';
  save.className='secondary';
  save.textContent='下载自测卡';
  again.className='text-action';
  again.textContent='重新测一次';
  shareActions.append(share,save);
  actions.className='result-actions';
  actions.replaceChildren(continueBtn,note,playBtn,shareActions,again);
  const showResult=()=>{nextStage.hidden=true;result.hidden=false;document.querySelector('.top').hidden=false;window.scrollTo(0,0)};
  const showNext=(view,team='')=>{result.hidden=true;nextStage.hidden=false;document.querySelector('.top').hidden=true;render(view,team);window.scrollTo(0,0)};
  const previewNote='<p class="preview-label">手机号与球员身份由赛小蜂服务号核验，自测结果不会自动成为正式赛事数据。</p>';
  function render(view,team){
    if(view==='register') nextStage.innerHTML=`<div class="onboard-register"><nav aria-label="登记流程"><ol class="onboard-steps"><li aria-current="step"><span>1</span>登记球员</li><li><span>2</span>选择球队</li><li><span>3</span>邀请队友</li></ol></nav><header class="onboard-heading"><p class="onboard-kicker">赛小蜂足球 · 球员档案</p><h2>注册球员</h2><p>验证手机号，建立或认领自己的档案。</p></header><section class="onboard-summary" aria-labelledby="prefill-heading"><div class="summary-heading"><h3 id="prefill-heading">你的自测资料</h3><span>带入登记页</span></div><dl class="onboard-facts"><div><dt>场上位置</dt><dd id="prefill-position"></dd></div><div><dt>年龄</dt><dd id="prefill-age"></dd></div><div><dt>身高</dt><dd id="prefill-height"></dd></div><div><dt>体重</dt><dd id="prefill-weight"></dd></div></dl></section><div class="onboard-followup"><span class="followup-number">下一步</span><div><strong>选择你的球队</strong><p>已有球队就加入，没有再新建。</p></div></div><footer class="onboard-footer"><button type="button" class="primary" id="self-register-link" data-href="">验证手机号并登记<span aria-hidden="true">→</span></button><button class="back-link" type="button" data-next="result">返回身价结果</button><p class="onboard-privacy">自测资料未经核实，不计入正式赛事数据。<br>年龄仅用于自测，登记时需填写出生日期。</p></footer></div>`;
    else if(view==='choose') nextStage.innerHTML=`<p class="eyebrow">02 / 球队选择</p><h2>接下来，和谁一起踢？</h2><p>已有球队就找队伍申请加入；没有球队，直接去赛小蜂足球小程序创建。</p><div class="next-grid"><button type="button" data-next="find">加入已有球队<small>找到球队，申请加入，等负责人确认</small></button><button type="button" data-next="mini-preview">没有球队，去小程序创建<small>建好后直接邀请队友入队</small></button></div><button class="back-link" type="button" data-next="register">返回上一步</button>${previewNote}`;
    else if(view==='find'||view==='find-new') nextStage.innerHTML=`<p class="eyebrow">03 / 查找球队</p><h2>先找找你的球队</h2><p>输入球队名称。实际接入时会查球队库，已有球队走加入或认领；没有记录再创建新队。</p><label class="field-label" for="team-name">球队名称</label><input id="team-name" class="field" maxlength="36" placeholder="例如：开封绿茵队"><button id="lookup-team" type="button" class="primary" style="margin-top:14px">查找球队</button><p id="lookup-error" class="status-message" role="status"></p><div id="team-actions" class="team-actions" hidden></div><button class="back-link" type="button" data-next="choose">返回球队选择</button>${previewNote}`;
    else if(view==='join') nextStage.innerHTML=`<p class="eyebrow">04 / 申请加入</p><h2>申请加入这支球队</h2><div class="next-card"><strong id="join-team-name"></strong>你提交申请，球队负责人确认后，才能正式进入球队。</div><button class="primary" type="button" data-next="join-done">模拟提交入队申请</button><button class="back-link" type="button" data-next="find">返回查找</button>${previewNote}`;
    else if(view==='create') nextStage.innerHTML=`<p class="eyebrow">04 / 创建球队</p><h2>把队友都叫进来</h2><div class="next-card"><strong id="create-team-name"></strong>查重确认没有这支队后，由你创建新球队。创建成功，你管理这支队并邀请队友。</div><button class="primary" type="button" data-next="created">模拟创建并生成邀请</button><button class="back-link" type="button" data-next="find-new">返回查找</button>${previewNote}`;
    else if(view==='mini-preview') nextStage.innerHTML=`<p class="eyebrow">赛小蜂足球小程序 · 创建球队</p><h2>先给球队起个名字</h2><p>正式入口直达小程序的创建球队页。创建人管理新队，建好后可以发邀请给队友。</p><label class="field-label" for="mini-team-name">球队名称</label><input id="mini-team-name" class="field" maxlength="30" placeholder="例如：开封绿茵队"><button id="mini-create-team" type="button" class="primary" style="margin-top:14px">模拟创建球队</button><p id="mini-create-error" class="status-message" role="status"></p><button class="back-link" type="button" data-next="choose">返回球队选择</button><p class="preview-label">小程序目标页：pages/onboarding/onboarding?step=team。当前是本地预览，不会唤起微信或创建真实球队。</p>`;
    else if(view==='created') nextStage.innerHTML=`<p class="eyebrow">小程序 · 创建完成</p><h2>球队建好了，接着邀请队友</h2><div class="invite-sheet"><strong id="invite-team-name"></strong><p>球队创建成功页提供“邀请队员入队”按钮，点击后生成本队专属邀请二维码和海报。</p></div><div class="next-card">把邀请发给队友 → 队友通过服务号认领资料 → 负责人确认入队。之后球员可以在服务号查看自己的资料与球员卡。</div><button class="primary" type="button" data-next="invite-preview">邀请队员入队</button><button class="back-link" type="button" data-next="result">返回自测结果</button>${previewNote}`;
    else if(view==='invite-preview') nextStage.innerHTML=`<p class="eyebrow">小程序 · 邀请队员</p><h2>把入队邀请发给队友</h2><div class="next-card"><strong id="invite-team-name"></strong>现有邀请页可以生成球队专属二维码和海报。队友扫码登记后，申请进入球队待确认列表，由你审核。</div><p>队友加入后，就能在服务号看自己的资料；参加赛事产生的记录经核实后进入个人档案。</p><button class="primary" type="button" data-next="result">返回自测结果</button>${previewNote}`;
    else if(view==='join-done') nextStage.innerHTML=`<p class="eyebrow">05 / 等待确认</p><h2>入队申请需要球队确认</h2><p>这是流程演示。正式接入后，球队负责人会收到入队申请；通过后，你才能以这支队的球员身份参加后续流程。</p><button class="primary" type="button" data-next="result">返回自测结果</button>${previewNote}`;
    else if(view==='free') nextStage.innerHTML=`<p class="eyebrow">03 / 自由球员</p><h2>暂时没队，也能先留下自己</h2><p>保存个人档案和球员卡。等你有球队了，再按真实身份申请加入；比赛经历会跟着你的球员档案走。</p><button class="primary" type="button" data-next="result">返回自测结果</button>${previewNote}`;
    for(const [id,value] of [['join-team-name',team],['create-team-name',team],['invite-team-name',team]]){const element=$(id);if(element)element.textContent=value}
    const prefill=$('registration-prefill');if(prefill)prefill.textContent=`${$('position').value} · ${$('age').value}岁 · 身高 ${$('height').value} cm · 体重 ${$('weight').value} kg`;
    for(const [id,source,unit] of [['prefill-position','position',''],['prefill-age','age','岁'],['prefill-height','height','cm'],['prefill-weight','weight','kg']]){
      const node=$(id);if(node){const value=$(source)?.value;node.textContent=value?value+(unit?' '+unit:''):'未填写'}
    }
    // 注册在服务号完成：把自测资料与活动 sid 带到自助登记页，不再要求先有球队邀请。
    const registerLink=$('self-register-link');
    if(registerLink){
      const params=new URLSearchParams({from:'selftest',h:$('height').value,w:$('weight').value,pos:$('position').value});
      const sessionId=localStorage.getItem('sxf-valuation-selftest-session-v1')||'';
      if(/^[0-9a-f-]{36}$/i.test(sessionId))params.set('sid',sessionId);
      registerLink.dataset.href='https://www.sxffootball.cn/service-account-h5/self-register.html?'+params.toString();
    }
  }
  function openExit(){if(dialog.open)dialog.close();if(history.length>1)history.back();else location.href='https://www.sxffootball.cn/'}
  continueBtn.addEventListener('click',()=>showNext('register'));
  playBtn.addEventListener('click',()=>dialog.showModal());
  dialog.addEventListener('click',event=>{const action=event.target.dataset.action;if(action==='register'){dialog.close();showNext('register')}if(action==='exit')openExit()});
  nextStage.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    const choice=target.dataset.next;
    if(target.id==='self-register-link'){const href=target.dataset.href;if(href)location.href=href;return}
    if(choice){if(choice==='result')showResult();else showNext(choice,currentTeam);return}
    if(target.id==='lookup-team'){
      currentTeam=$('team-name').value.trim();
      if(currentTeam.length<2){$('lookup-error').textContent='请填写至少两个字的球队名称';return}
      $('lookup-error').textContent='预览页未连接球队库。下面两种情况都可以点开查看。';
      const choices=$('team-actions');choices.hidden=false;choices.replaceChildren();
      for(const [view,label] of [['join','如果球队已有负责人：申请加入'],['create','如果球队尚未创建：创建新球队']]){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.addEventListener('click',()=>showNext(view,currentTeam));choices.append(btn)}
    }
    if(target.id==='mini-create-team'){
      currentTeam=$('mini-team-name').value.trim();
      if(currentTeam.length<2){$('mini-create-error').textContent='请填写至少两个字的球队名称';return}
      showNext('created',currentTeam);
    }
  });
  let currentTeam='';
  const experience=document.createElement('section');
  experience.style.cssText='border-top:1px solid #dce8df;padding:18px 0 4px;margin-top:16px';
  result.querySelector('#axes').insertAdjacentElement('afterend',experience);
  function showSelfHistory(){
    if(result.hidden)return;
    const types=$('competitionTypes').value.split('|').filter(Boolean).join('、')||'未填写';
    experience.replaceChildren();
    const heading=document.createElement('h2');heading.textContent='我填的比赛经历';heading.style.cssText='font-size:17px;margin:0 0 10px';experience.append(heading);
    for(const [label,value] of [['参加过的赛事',types],['正式比赛常踢',$('matchFormat').value||'未填写'],['平时约球常踢',$('friendlyFormat').value||'未填写']]){const row=document.createElement('div');row.style.cssText='font-size:13px;line-height:1.8;color:#3d5847';row.textContent=label+'：'+value;experience.append(row)}
    const note=document.createElement('p');note.style.cssText='font-size:12px;line-height:1.6;color:#6d7f72;margin:8px 0 0';note.textContent='以上是本人填写的经历，尚未经过赛事核实。';experience.append(note);
  }
  const hidePreviewButton=()=>{const debug=$('demo-share');if(debug)debug.hidden=true};
  new MutationObserver(hidePreviewButton).observe(result,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(showSelfHistory).observe(result,{attributes:true,attributeFilter:['hidden']});
  hidePreviewButton();
})();
