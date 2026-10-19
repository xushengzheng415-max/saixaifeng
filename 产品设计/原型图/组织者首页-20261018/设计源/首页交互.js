
const toast=document.querySelector('.toast');let timer;
function say(s){toast.textContent=s;toast.hidden=false;clearTimeout(timer);timer=setTimeout(()=>toast.hidden=true,2500)}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('[data-pc]').forEach(b=>b.onclick=()=>document.querySelector('#pc-dialog').showModal());
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText('https://www.sxffootball.cn');say('网址已复制')}catch{say('请长按网址复制')}});
document.querySelectorAll('[data-destination]').forEach(b=>b.onclick=e=>{e.preventDefault();const name=b.dataset.destination;if(name==='首页')return;document.querySelector('#destination-title').textContent=name;document.querySelector('#route-dialog').showModal()});
const state=new URLSearchParams(location.search).get('state');if(state&&document.querySelector('#dynamic-area')){document.querySelector('#dynamic-area').innerHTML=state==='loading'?'<div class="state-note" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>':'<div class="state-note" role="alert">赛事暂未加载，请重试。<button onclick="location.search=\'\'">重新加载</button></div>'}
