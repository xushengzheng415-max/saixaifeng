import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 响应式断点检测 composable
 * 断点规则（移动优先）：
 *   - 移动端 isMobile: < 768px
 *   - 平板   isTablet: 768px - 1023px
 *   - 桌面   isDesktop: ≥ 1024px
 * @returns {{ isMobile: import('vue').Ref<boolean>, isTablet: import('vue').Ref<boolean>, isDesktop: import('vue').Ref<boolean>, width: import('vue').Ref<number> }}
 */
export function useResponsive() {
  const MOBILE_BREAKPOINT = 768
  const TABLET_BREAKPOINT = 1024

  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const isMobile = ref(width.value < MOBILE_BREAKPOINT)
  const isTablet = ref(width.value >= MOBILE_BREAKPOINT && width.value < TABLET_BREAKPOINT)
  const isDesktop = ref(width.value >= TABLET_BREAKPOINT)

  function update() {
    const w = window.innerWidth
    width.value = w
    isMobile.value = w < MOBILE_BREAKPOINT
    isTablet.value = w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT
    isDesktop.value = w >= TABLET_BREAKPOINT
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    update()
    window.addEventListener('resize', update, { passive: true })
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('resize', update)
  })

  return { isMobile, isTablet, isDesktop, width }
}

export default useResponsive
