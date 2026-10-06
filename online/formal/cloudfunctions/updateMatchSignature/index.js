// 旧版直接更新 matches 的签字入口已停用。
// 正式签字必须通过 serviceMatchWorkflow.submitSignedRefereeRecord。
exports.main = async function() {
  return {
    code: -2,
    success: false,
    message: '该签字入口已停用，请从裁判服务号/H5进入比赛后完成电子记录签字',
    error: 'LEGACY_SIGNATURE_ENTRY_RETIRED'
  }
}
