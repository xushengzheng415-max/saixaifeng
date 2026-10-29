'use strict'
// 身份证前置核验 + 「生成球员卡」按钮修复的隔离浏览器验收（2026-10-29）。
// 真实加载 service-entry.css / registration-idcheck.css / registration-idcheck.js，
// 网络全部拦截：不碰真实会话、蜂蜜与球员档案。
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname, '..'), h5 = path.join(root, 'service-account-h5')
const out = path.join(root, 'output/registration-idcheck-20261029')
function id(serial) {
  const prefix = '1101011990' + '0101' + String(serial).padStart(3, '0')
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  return prefix + '10X98765432'[prefix.split('').reduce((sum, n, index) => sum + Number(n) * weights[index], 0) % 11]
}
const taken = id(1), free = id(2)
const CONFLICT = '本队已有该身份证档案，请返回查找并认领'
// 只复刻登记页与本需求相关的结构：身份证行（含页面自己的格式提示）+ 形象照区（含待确认小字与生成按钮）。
const fixture = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<link rel="stylesheet" href="./service-entry.css"><link rel="stylesheet" href="./registration-idcheck.css"></head>'
  + '<body><main class="entry"><header><h1>球员登记</h1></header><div id="status" role="status"></div><section id="content">'
  + '<h2>隔离测试球队</h2><button class="text-action" id="backToSearch" type="button">重新选择球员</button>'
  + '<form id="form"><div class="row"><label for="idCard">球员身份证号</label>'
  + '<input id="idCard" required maxlength="18" placeholder="18 位身份证号"><small id="idCardHint" class="field-hint muted" role="status" hidden></small></div>'
  + '<div class="row"><label>形象照</label><div class="photo-card"><small id="photoState" class="muted">球员卡待确认</small>'
  + '<button id="editRegistrationCard" type="button" class="text-action">生成球员卡</button></div></div>'
  + '<button class="wide" type="submit">确认新建</button></form></section></main>'
  + '<script>'
  + 'document.getElementById("backToSearch").onclick=function(){'
  + 'var c=document.getElementById("content");'
  + 'c.innerHTML="<h2>隔离测试球队</h2><form id=\\"searchForm\\"><div class=\\"row\\"><label for=\\"playerQuery\\">身份证号或姓名</label><input id=\\"playerQuery\\" maxlength=\\"30\\" required></div><button class=\\"wide\\" id=\\"searchPlayers\\" type=\\"submit\\">查找球员</button></form>";'
  + 'document.getElementById("searchForm").onsubmit=function(event){event.preventDefault();window.__searched=document.getElementById("playerQuery").value.trim()}'
  + '};'
  + 'document.getElementById("form").onsubmit=function(event){event.preventDefault();window.__pageSubmit=(window.__pageSubmit||0)+1}'
  + '</script><script src="./registration-idcheck.js"></script></body></html>'

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
    const calls = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname.includes('tcloudbase.com')) {
        const body = route.request().postDataJSON() || {}
        calls.push(body)
        if (body.action === 'serviceEntryCheckPlayerId') {
          const duplicate = String(body.idCard || '').toUpperCase() === taken
          const payload = duplicate
            ? { success: true, available: false, idCard: taken, code: 'PLAYER_IDCARD_CONFLICT', message: CONFLICT }
            : { success: true, available: true, idCard: body.idCard, birthDate: '1990-01-01' }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
      if (url.pathname.endsWith('/idcheck-fixture.html')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture })
      const file = path.join(h5, decodeURIComponent(url.pathname.split('/').pop()))
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', body: fs.readFileSync(file) })
      }
      return route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('https://www.sxffootball.cn/service-account-h5/idcheck-fixture.html?entry=fixture-entry')
    await page.evaluate(() => sessionStorage.setItem('sxf_entry_session_fixture-entry', 'qa-token'))

    // 1) 「生成球员卡」必须是整行、居中、主色的大按钮，而不是原先的小号文字。
    const look = await page.locator('#editRegistrationCard').evaluate(button => {
      const box = button.getBoundingClientRect(), parent = button.parentNode.getBoundingClientRect(), style = getComputedStyle(button)
      return { width: box.width, center: (box.left + box.right) / 2, parentWidth: parent.width, parentCenter: (parent.left + parent.right) / 2, fontSize: style.fontSize, background: style.backgroundColor, color: style.color, textAlign: style.textAlign, minHeight: style.minHeight }
    })
    assert.ok(look.width >= look.parentWidth - 30, '按钮需铺满形象照区一行')
    assert.equal(look.fontSize, '16px')
    assert.equal(look.background, 'rgb(8, 125, 75)')
    assert.equal(look.color, 'rgb(255, 255, 255)')
    assert.equal(look.textAlign, 'center')
    assert.ok(Math.abs(look.center - look.parentCenter) < 2, '按钮需水平居中')
    // hidden 仍然有效：未上传形象照时页面靠 hidden 收起它，不能被样式撑出来。
    assert.equal(await page.locator('#editRegistrationCard').evaluate(button => { button.hidden = true; return getComputedStyle(button).display }), 'none')
    await page.locator('#editRegistrationCard').evaluate(button => { button.hidden = false })
    await page.screenshot({ path: path.join(out, 'form-button-375.png'), fullPage: true })

    // 2) 填满 18 位就前置核验；本队已有该身份证时红字提示 + 给出认领入口。
    await page.locator('#idCard').fill(taken)
    await page.waitForFunction(message => {
      const box = document.getElementById('idCardCheck')
      return box && !box.hidden && box.textContent.includes(message)
    }, CONFLICT)
    assert.equal(await page.locator('#idCardCheck').evaluate(box => box.className.includes('idcheck-error')), true)
    assert.equal(await page.locator('#idCardFindOwner').isVisible(), true)
    await page.screenshot({ path: path.join(out, 'conflict-375.png'), fullPage: true })

    // 3) 命中重复时提交被拦住：页面自己的 submit 处理器不会执行。
    await page.locator('button[type=submit]').click()
    assert.equal(await page.evaluate(() => window.__pageSubmit), undefined)
    assert.ok((await page.locator('#status').innerText()).includes(CONFLICT))

    // 4) 换成未占用的身份证则放行，提交回到页面自己的流程。
    await page.locator('#idCard').fill(free)
    await page.waitForFunction(() => document.getElementById('idCardCheck').hidden)
    await page.locator('button[type=submit]').click()
    assert.equal(await page.evaluate(() => window.__pageSubmit), 1)

    // 5) 重新填回重复号码 → 再被拦住；「去查找并认领」把身份证带进查找页并自动查一次。
    await page.locator('#idCard').fill(taken)
    await page.waitForFunction(message => {
      const box = document.getElementById('idCardCheck')
      return box && !box.hidden && box.textContent.includes(message)
    }, CONFLICT)
    await page.locator('#idCardFindOwner').click()
    await page.waitForFunction(value => window.__searched === value, taken)
    assert.deepEqual(errors, [])
    assert.equal(calls.filter(call => call.action === 'serviceEntryCheckPlayerId').length, 3)
    assert.ok(calls.filter(call => call.action === 'serviceEntryCheckPlayerId').every(call => call.serviceEntrySession === 'qa-token'))
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ look, calls: calls.map(call => call.action) }, null, 2))
    console.log('PASS registration idcheck: full-width centered card button, early duplicate block, claim handoff')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
