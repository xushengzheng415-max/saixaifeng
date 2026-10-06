var release = require('../../../config/release')

Page({
  data: {
    version: release.version,
    releaseDate: release.releaseDate,
    status: release.status,
    title: release.title,
    summary: release.summary,
    notice: release.notice,
    sections: release.sections
  }
})
