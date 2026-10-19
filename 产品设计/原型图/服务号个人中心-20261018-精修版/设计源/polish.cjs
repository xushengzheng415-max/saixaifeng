const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..')
require('./build.cjs')
const css=fs.readFileSync(path.join(__dirname,'精修.css'),'utf8')
for(const name of ['P01-球员身份.html','P02-裁判身份.html']){
 const file=path.join(__dirname,name)
 let html=fs.readFileSync(file,'utf8').replace('</style>',css+'</style>').replace('同一账号，蜂蜜余额通用','账号通用余额 · 切换身份不影响蜂蜜')
 fs.writeFileSync(file,html)
}
const file=path.join(root,'原型清单.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.plan_revision=2
for(const asset of manifest.assets)if(asset.path.endsWith('stadium.jpg')){asset.source='项目miniprogram/images/runtime/team-data-emerald-stadium-v1.jpg';asset.license='项目既有品牌场景素材，仅本项目原型使用'}
fs.writeFileSync(file,JSON.stringify(manifest,null,2))
const planFile=path.join(root,'页面方案.json'),plan=JSON.parse(fs.readFileSync(planFile));plan.revision=2;fs.writeFileSync(planFile,JSON.stringify(plan,null,2))
