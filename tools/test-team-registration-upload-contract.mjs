import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPayloadTooLargeError, resolveChunkUploadTarget } from '../web-admin-vue/src/utils/chunkUploadPath.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const importer = fs.readFileSync(path.join(root, 'web-admin-vue/src/components/tournament/TeamRegistrationWordImporter.vue'), 'utf8')
const uploadClient = fs.readFileSync(path.join(root, 'web-admin-vue/src/utils/cloud.js'), 'utf8')
const uploadBackend = fs.readFileSync(path.join(root, 'cloudfunctions/uploadFile/index.js'), 'utf8')
const backend = fs.readFileSync(path.join(root, 'cloudfunctions/tournamentRegistrationFlow/index.js'), 'utf8')

assert.deepEqual(
  resolveChunkUploadTarget('football/team-registration-imports/tournament-1/team-1.docx', 'original.docx'),
  { folder: 'football/team-registration-imports/tournament-1', fileName: 'team-1.docx' }
)
assert.deepEqual(
  resolveChunkUploadTarget('player-photos/imports/tournament-1/person-1.png', 'portrait.png'),
  { folder: 'player-photos/imports/tournament-1', fileName: 'person-1.png' }
)
assert.throws(() => resolveChunkUploadTarget('../outside/file.png'), /上传路径无效/)
assert.equal(isPayloadTooLargeError(new Error('EXCEED_MAX_PAYLOAD_SIZE')), true)
assert.equal(isPayloadTooLargeError(new Error('Exceed max request payload size.')), true)
assert.equal(isPayloadTooLargeError(new Error('network timeout')), false)

assert.match(importer, /chunkSize:\s*48\s*\*\s*1024/)
assert.match(importer, /fallbackChunkSize:\s*32\s*\*\s*1024/)
assert.match(importer, /photoProcessingStatus === 'processed'/)
assert.match(importer, />工作人员资料</)
assert.match(importer, /person\.birthDate/)
assert.match(importer, /person\.nativePlace/)
assert.match(importer, /maskRegistrationIdentity\(person\.identityNumber\)/)
assert.match(importer, /上传报名表 \$\{Math\.round\(received \/ total \* 100\)\}%/)
assert.match(uploadClient, /isPayloadTooLargeError\(error\)/)
assert.match(uploadClient, /action:\s*'abortChunk'/)
assert.match(backend, /\/football\/team-registration-imports\/\$\{tournamentId\}\//)
assert.match(backend, /\/player-photos\/imports\/\$\{tournamentId\}\//)
assert.match(uploadBackend, /case 'abortChunk'/)
assert.match(uploadBackend, /removeChunkUploadData\(uploadId\)/)

console.log('team registration upload contract: PASS')
