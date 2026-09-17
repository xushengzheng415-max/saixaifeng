import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const registration=read('cloudfunctions/tournamentRegistrationFlow/index.js')
const mini=read('cloudfunctions/getMiniWorkspace/index.js')
const web=read('cloudfunctions/webLoginApi/index.js')
const h5=read('service-account-h5/app.js')
const match=read('cloudfunctions/serviceMatchWorkflow/index.js')
const teamDetail=read('web-admin-vue/src/views/team/TeamDetail.vue')
const app=JSON.parse(read('miniprogram/app.json'))
const importBody=registration.slice(registration.indexOf('async function importTeamRegistrationBatch'),registration.indexOf('async function createTargetedTeamInvitations'))

assert.match(importBody,/registration_import_batches/)
assert.match(importBody,/registration_player_drafts/)
assert.match(importBody,/collection\('players'\)\.add/)
assert.match(importBody,/collection\('roster_snapshots'\)\.add/)
assert.match(importBody,/playerReviewStatus:'completed'/)
assert.match(importBody,/playerMode:'formal'/)
assert.match(importBody,/rosterMode:'approved'/)
assert.match(importBody,/IMPORT_PLAYER_IDENTITY_CONFLICT/)
assert.match(mini,/async function transferImportedPlayerDrafts/)
assert.match(mini,/async function reviewImportedPlayerDraftsForWorkspace/)
assert.match(mini,/IMPORT_DRAFT_CONFLICT_LOCKED/)
assert.match(mini,/identityStatus:'not_verified'/)
assert.match(mini,/identityVerificationRequired:true/)
assert.match(mini,/async function adultElectronicPassForWorkspace/)
assert.match(web,/local_ocr_face_1to1/)
assert.match(web,/organizer_double_review/)
assert.match(web,/retentionDays:30/)
assert.match(web,/SXF_IDENTITY_FEATURE_KEY/)
assert.match(h5,/face-api-1\.7\.15/)
assert.match(h5,/不使用人脸，申请人工核验/)
assert.match(match,/previewAdultMatchPass/)
assert.match(match,/SXF_MATCH_PASS_SECRET/)
assert.match(match,/collection\('roster_snapshots'\)/)
assert.match(match,/PLAYER_IDENTITY_NOT_READY/)
assert.match(teamDetail,/报名表导入/)
assert.match(teamDetail,/tournamentRelation\.value\.contactPhone/)
assert.match(teamDetail,/@click\.stop="editPlayer\(row\)"/)
assert.match(teamDetail,/正式名单/)
assert.ok(fs.existsSync(path.join(root,'service-account-h5/vendor/face-api/model/face_recognition_model.bin')))
assert.ok(app.subpackages.some(pkg=>pkg.root==='pages/team'&&pkg.pages.includes('imported-player-review/imported-player-review')))
assert.ok(app.pages.includes('pages/player/electronic-pass/electronic-pass'))

const wxmlFiles=[
  'miniprogram/pages/team/imported-player-review/imported-player-review.wxml',
  'miniprogram/pages/player/electronic-pass/electronic-pass.wxml'
]
for(const file of wxmlFiles){const source=read(file);assert.doesNotMatch(source,/{{[^}]*\?[^}]*:[^}]*}}/,`${file} contains ternary`);assert.doesNotMatch(source,/{{[^}]*===?[^}]*}}/,`${file} contains comparison`);assert.doesNotMatch(source,/{{[^}]*\.find\s*\(/,`${file} contains method call`)}
console.log('PASS direct formal import, roster snapshot, player editing, identity gate and adult pass contracts')
