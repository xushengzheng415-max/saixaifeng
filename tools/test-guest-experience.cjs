'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),content=require('../miniprogram/components/guest-experience/content');
let definition;const events=[];
vm.runInNewContext(read('miniprogram/components/guest-experience/index.js'),{
  Component:v=>{definition=v},require:()=>content,
  wx:{getMenuButtonBoundingClientRect:()=>({top:48}),cloud:new Proxy({}, {get(){throw Error('Guest guide must not call cloud APIs')}}),setStorageSync(){throw Error('Guest guide must not change identity or persisted state')}}
});
const c={...definition.methods,data:structuredClone(definition.data),setData(v,cb){Object.assign(this.data,v);if(cb)cb.call(this)},triggerEvent:name=>events.push(name)};
definition.lifetimes.attached.call(c);assert.equal(c.data.topStyle,'padding-top:48px;');
let modules=0;const imagePaths=new Set(),imageHashes=new Set();
for(const roleId of ['team','organizer']){
  c.selectRole({currentTarget:{dataset:{id:roleId}}});
  assert.equal(c.data.roleId,roleId);assert.equal(c.data.features.length,7);
  assert.equal(c.data.roleTabs.filter(t=>t.selected).length,1);
  const features=c.data.features.slice();
  for(const feature of features){
    c.selectFeature({currentTarget:{dataset:{id:feature.id}}});assert.equal(c.data.feature.id,feature.id);
    assert.equal(c.data.features.filter(t=>t.selected).length,1);
    assert.equal(c.data.process.length,3);assert.ok(c.data.feature.detail && c.data.feature.note);
    assert.ok(fs.existsSync(path.join(root,'miniprogram',c.data.effectImage)));
    imagePaths.add(c.data.effectImage);
    imageHashes.add(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'miniprogram',c.data.effectImage))).digest('hex'));
    assert.ok(fs.existsSync(path.join(root,'miniprogram',c.data.roleHero)));
    assert.equal(['previewPeople','previewChecklist','previewPitch','previewPoster','previewSchedule','previewFlow'].filter(k=>c.data[k]).length,1);
    for(const item of c.data.features){assert.ok(fs.existsSync(path.join(root,'miniprogram',item.icon)));assert.ok(fs.existsSync(path.join(root,'miniprogram',item.cover)))}
    modules++;
  }
}
assert.equal(imagePaths.size,14,'Each feature must have its own illustration path');
assert.equal(imageHashes.size,14,'Features must not reuse the same illustration content');
c.selectRole({currentTarget:{dataset:{id:'unknown'}}});assert.equal(c.data.roleId,'team');
c.selectFeature({currentTarget:{dataset:{id:'unknown'}}});assert.equal(c.data.feature.id,'players');
c.selectRole({currentTarget:{dataset:{id:'team'}}});
c.selectFeature({currentTarget:{dataset:{id:'annual'}}});assert.equal(c.data.feature.device,'规划中');assert.match(c.data.feature.detail,/计划/);assert.match(c.data.feature.note,/尚未开放/);
c.selectRole({currentTarget:{dataset:{id:'organizer'}}});
c.selectFeature({currentTarget:{dataset:{id:'supplement'}}});assert.match(c.data.feature.note,/锁定/);
c.onEffectImageError();assert.equal(c.data.effectImageFailed,true);c.retryEffectImage();assert.equal(c.data.effectImageFailed,false);
c.login();c.publicEvents();assert.deepEqual(events,['login','publicevents']);
const markup=read('miniprogram/pages/home/home.wxml'),source=read('miniprogram/pages/home/home.js'),config=JSON.parse(read('miniprogram/pages/home/home.json'));
assert.match(markup,/<guest-experience[^>]+wx:if="\{\{!isLoggedIn\}\}"[^>]+bindlogin="goToLogin"[^>]+bindpublicevents="goToPublicCenter"/);
assert.ok(config.usingComponents['guest-experience']);assert.ok(!config.usingComponents['guest-guide']);
assert.ok(!/guestDemoMetrics|guestDemoTasks|maybeShowGuestGuide/.test(source));
assert.ok(!/今日工作概览|演示任务|首页功能演示/.test(markup));
console.log('PASS guest introduction: 2 role views / '+modules+' selectable modules; local illustrations and three-step guides; login/public callbacks; no cloud writes or identity/storage changes; old fictional dashboard removed.');
