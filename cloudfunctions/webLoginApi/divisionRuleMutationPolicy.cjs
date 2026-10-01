'use strict'

const ACTIVE_RULE_STATUSES = new Set(['ongoing','in_progress','live','completed','finished'])

function statusInProgress(value) {
  return ACTIVE_RULE_STATUSES.has(String(value || '').trim().toLowerCase())
}

module.exports = { statusInProgress }
