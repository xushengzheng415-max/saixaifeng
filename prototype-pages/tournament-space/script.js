const toast = document.querySelector('.toast')
let toastTimer

function showToast(message) {
  window.clearTimeout(toastTimer)
  toast.textContent = message
  toast.classList.add('visible')
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('visible')
  }, 1900)
}

document.querySelectorAll('[data-toast]').forEach((element) => {
  element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    showToast(element.dataset.toast)
    element.closest('.user-dropdown, .card-menu')?.classList.remove('open')
  })
})

const userTrigger = document.querySelector('.user-trigger')
const userDropdown = document.querySelector('.user-dropdown')

userTrigger.addEventListener('click', (event) => {
  event.stopPropagation()
  const isOpen = userDropdown.classList.toggle('open')
  userTrigger.setAttribute('aria-expanded', String(isOpen))
  document.querySelectorAll('.card-menu.open').forEach((menu) => menu.classList.remove('open'))
})

document.querySelectorAll('.card-more').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    const menu = button.nextElementSibling
    const willOpen = !menu.classList.contains('open')
    document.querySelectorAll('.card-menu.open').forEach((item) => item.classList.remove('open'))
    userDropdown.classList.remove('open')
    userTrigger.setAttribute('aria-expanded', 'false')
    menu.classList.toggle('open', willOpen)
  })
})

document.addEventListener('click', () => {
  userDropdown.classList.remove('open')
  userTrigger.setAttribute('aria-expanded', 'false')
  document.querySelectorAll('.card-menu.open').forEach((menu) => menu.classList.remove('open'))
})
