// 旧版图片签字入口已停用。
// 正式电子记录签字必须在裁判服务号/H5中完成，并由
// serviceMatchWorkflow.submitSignedRefereeRecord 统一校验和落库。
exports.main = async function() {
  return {
    code: -2,
    success: false,
    message: '该签字入口已停用，请从裁判服务号/H5进入比赛后完成电子记录签字',
    error: 'LEGACY_SIGNATURE_ENTRY_RETIRED'
  }
}
