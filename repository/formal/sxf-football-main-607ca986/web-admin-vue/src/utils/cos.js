import { callFunction } from './cloud'

/**
 * 上传 Base64 图片到云存储
 * @param {string} base64Data Base64 图片数据
 * @param {string} folder 存储文件夹
 * @param {string} filename 文件名
 * @returns {Promise<Object>}
 */
export async function uploadBase64ToCOS(base64Data, folder = 'images', filename = null) {
  return callFunction('uploadToCOS', {
    action: 'uploadBase64',
    data: {
      base64Data,
      folder,
      filename
    }
  })
}

/**
 * 删除云存储文件
 * @param {string} fileID 文件 ID
 * @returns {Promise<Object>}
 */
export async function deleteCOSObject(fileID) {
  return callFunction('uploadToCOS', {
    action: 'delete',
    data: { fileID }
  })
}
