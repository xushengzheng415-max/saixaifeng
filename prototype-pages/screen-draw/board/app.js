(function () {
  'use strict'
  const data = window.BOARD_DATA
  const nodes = data.sections.flatMap(section => section.groups.flatMap(group => group.nodes))
  const board = document.getElementById('board')
  const viewer = document.getElementById('viewer')
  const viewerImage = document.getElementById('viewerImage')
  const viewerTitle = document.getElementById('viewerTitle')
  const viewerIndex = document.getElementById('viewerIndex')
  const viewerLogic = document.getElementById('viewerLogic')
  let activeIndex = 0
  let scale = 1

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function openViewer(index) {
    activeIndex = (index + nodes.length) % nodes.length
    const item = nodes[activeIndex]
    viewerTitle.textContent = item.label
    viewerIndex.textContent = `${activeIndex + 1} / ${nodes.length}`
    viewerLogic.textContent = item.logic
    viewerImage.src = item.path
    viewerImage.alt = item.label
    scale = 1
    viewerImage.style.transform = 'scale(1)'
    if (!viewer.open) viewer.showModal()
  }

  nodes.forEach((item, index) => {
    const card = element('article', 'screen-card')
    const meta = element('div', 'screen-meta')
    meta.append(element('span', '', `0${index + 1}`), element('b', '', item.label))
    const image = document.createElement('img')
    image.src = item.path
    image.alt = item.label
    image.loading = 'lazy'
    const logic = element('p', '', item.logic)
    const button = element('button', '', '查看 1920×1080 原图')
    button.type = 'button'
    button.addEventListener('click', () => openViewer(index))
    card.append(meta, image, logic, button)
    board.append(card)
  })

  document.getElementById('closeViewer').addEventListener('click', () => viewer.close())
  document.getElementById('previous').addEventListener('click', () => openViewer(activeIndex - 1))
  document.getElementById('next').addEventListener('click', () => openViewer(activeIndex + 1))
  document.getElementById('zoomIn').addEventListener('click', () => { scale = Math.min(2, scale + .15); viewerImage.style.transform = `scale(${scale})` })
  document.getElementById('zoomOut').addEventListener('click', () => { scale = Math.max(.4, scale - .15); viewerImage.style.transform = `scale(${scale})` })
  document.addEventListener('keydown', event => {
    if (!viewer.open) return
    if (event.key === 'ArrowLeft') openViewer(activeIndex - 1)
    if (event.key === 'ArrowRight') openViewer(activeIndex + 1)
    if (event.key === 'Escape') viewer.close()
  })
})()
