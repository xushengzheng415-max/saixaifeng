export const TABLET_LAYOUT_MEDIA = '(orientation: landscape) and (max-width: 1180px), (orientation: landscape) and (hover: none) and (pointer: coarse) and (min-width: 600px)'
export const TABLET_LAYOUT_EVENT = 'sxf-tablet-layout-change'

export function isPadClient(userAgent = '') {
  return /(?:^|\s)SxfFootballPad\/\d/.test(userAgent)
}

// The native shell is landscape-only. Its explicit marker must also work with a mouse/keyboard.
export function installTabletLayout(win = window, root = document.documentElement) {
  const query = win.matchMedia(TABLET_LAYOUT_MEDIA)
  const native = isPadClient(win.navigator.userAgent)
  const update = () => {
    const active = native || query.matches
    const changed = root.hasAttribute('data-tablet-landscape') !== active
    root.toggleAttribute('data-tablet-landscape', active)
    root.toggleAttribute('data-sxf-pad-client', native)
    if (changed) win.dispatchEvent(new win.CustomEvent(TABLET_LAYOUT_EVENT, { detail: { active } }))
  }
  update()
  query.addEventListener('change', update)
  return () => query.removeEventListener('change', update)
}
