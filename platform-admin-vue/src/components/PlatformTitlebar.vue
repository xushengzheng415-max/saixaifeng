<template>
  <div class="platform-titlebar">
    <div class="platform-titlebar-content">
      <img class="titlebar-logo" :src="logoUrl" alt="" />
      <span class="titlebar-name">赛小蜂足球 · 平台运营中心</span>
    </div>
  </div>
</template>

<script setup>
// 安装成桌面应用后（Chrome/Edge 的 window-controls-overlay 模式），窗口标题条改由页面绘制：
// 深绿底 + 白字，避免浏览器按主题色计算文字颜色时出现浅底白字看不清的问题。
// 普通浏览器标签页不触发该模式，本组件完全不显示、也不占用高度。
const logoUrl = import.meta.env.BASE_URL + 'logo-saixiaofeng.png'
</script>

<style scoped>
.platform-titlebar {
  display: none;
}

@media (display-mode: window-controls-overlay) {
  .platform-titlebar {
    display: flex;
    align-items: center;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1200;
    height: env(titlebar-area-height, 33px);
    background: linear-gradient(90deg, #0c3b27, #0a3222);
    box-sizing: border-box;
  }

  /* 可拖动区域只覆盖系统窗口按钮之外的标题区，右侧留给最小化/最大化/关闭。 */
  .platform-titlebar-content {
    position: absolute;
    top: 0;
    left: env(titlebar-area-x, 0px);
    width: env(titlebar-area-width, 100%);
    height: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 14px;
    box-sizing: border-box;
    app-region: drag;
    -webkit-app-region: drag;
    user-select: none;
  }

  .titlebar-logo {
    width: 20px;
    height: 20px;
    padding: 2px;
    border-radius: 6px;
    background: #ffffff;
    object-fit: contain;
    box-sizing: border-box;
  }

  .titlebar-name {
    color: #ffffff;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
