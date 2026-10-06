const tcb = require("@cloudbase/node-sdk")

/**
 * @param { prompt } event
 * @returns { image_url }
 */
exports.main = async (event, context) => {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
    const ai = app.ai()
    const imageModel = ai.createImageModel(process.env.PROVIDER || "hunyuan-image");
    if ( process.env.ENDPOINT_PATH ) {
        imageModel.defaultGenerateImageSubUrl = process.env.ENDPOINT_PATH;
    }

    if (!event.prompt) {
        return {
            code: 'invalid_param',
            message: '缺少 prompt 参数'
        }
    }

    const { style, model = 'hunyuan-image', ...restEvent } = event

    try {

        const res = await imageModel.generateImage({
            model,
            ...(/hunyuan-image-v3.0/.test(model) ? {
                revise: { "value": false },
                enable_thinking: { "value": false }
            } : {}),
            ...restEvent,
        });

        const { data, error } = res

        if (error) {
            return { success: false, ...error }
        }

        const img = data?.[0] || {}
        const { url, ...rest } = img

        return {
            ...rest,
            imageUrl: url || '',
            success: true
        }
    } catch (e) {
        return {
            success: false,
            code: 'request_error',
            message: e.message
        }
    }
}
