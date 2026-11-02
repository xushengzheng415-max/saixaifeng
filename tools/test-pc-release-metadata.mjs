import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {pcSourceHash,pcReleaseMetadata} from './pc-release-metadata.mjs'
const root=path.resolve('.codex-artifacts','pc-metadata-fixture-'+Date.now())
fs.mkdirSync(path.join(root,'web-admin-vue','src'),{recursive:true})
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})
git('init');git('config','user.name','PC release fixture');git('config','user.email','pc-fixture@example.invalid')
const commit=()=>{git('add','.');git('commit','-m','isolated metadata fixture')}
fs.writeFileSync(path.join(root,'web-admin-vue/src/index.js'),'export const version=1\n');commit()
const initial=pcSourceHash(root)
fs.mkdirSync(path.join(root,'unrelated-mobile'),{recursive:true});fs.writeFileSync(path.join(root,'unrelated-mobile/example.js'),'export const mobile=1\n');commit()
assert.equal(pcSourceHash(root),initial,'unrelated mobile work must not change PC identity')
fs.writeFileSync(path.join(root,'web-admin-vue/src/index.js'),'export const version=2\n');commit();const revised=pcSourceHash(root);assert.notEqual(revised,initial)
fs.mkdirSync(path.join(root,'desktop-windows/src'),{recursive:true});fs.writeFileSync(path.join(root,'desktop-windows/src/main.cjs'),'module.exports={}\n');commit();assert.notEqual(pcSourceHash(root),revised)
let metadata=pcReleaseMetadata(root,'/preview/admin/');assert.equal(metadata.channel,'preview');assert.equal(metadata.sourceDirty,false);assert.equal(metadata.pcSourceSha256,pcSourceHash(root))
fs.writeFileSync(path.join(root,'web-admin-vue/src/index.js'),'export const version=3\n');metadata=pcReleaseMetadata(root,'/admin/');assert.equal(metadata.channel,'production');assert.equal(metadata.sourceDirty,true)
console.log('PASS: PC identity follows committed web/desktop source, excludes unrelated mobile work, distinguishes channels and reports uncommitted source')
