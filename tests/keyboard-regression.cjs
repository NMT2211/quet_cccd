// Run: node tests/keyboard-regression.cjs [path-to-playwright-core]
// All external requests are intercepted. No real identity data or Telegram sends.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const raw = '091213006838|NGƯỜI KIỂM THỬ|01011990|Nam|12 Đường Mẫu, Phường Mẫu, Huyện Mẫu, Tỉnh Mẫu|01012020';
const person = { cccd: '091213006838', name: 'NGƯỜI KIỂM THỬ', dob: '01011990', gender: 'Nam', address: '12 Đường Mẫu, Phường Mẫu, Huyện Mẫu, Tỉnh Mẫu', issue: '01012020' };
const columns = ['Họ tên','Số CCCD','Ngày sinh','Giới tính','Tỉnh/TP','Xã/Phường/Đặc khu','Số nhà/Ấp/KP/Đường','Phòng'];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
const passed = [];
async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const telegram = [], conversions = [], errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = value => route.fulfill({ json: value });
      if (url.pathname.endsWith('/assets/html5-qrcode.min.js')) {
        return route.fulfill({ contentType: 'text/javascript', body: `window.Html5Qrcode = class { async start(c,o,cb){window.scanCallback=cb;window.scanStarted=true;} async stop(){window.scanStarted=false;} async clear(){} async scanFile(){return ${JSON.stringify(raw)};} };` });
      }
      if (url.origin === base) return route.continue();
      if (url.hostname === 'unpkg.com') {
        return route.fulfill({ contentType: 'text/javascript', body: `window.lucide={createIcons(){document.querySelectorAll('i[data-lucide]').forEach(el=>{const name=el.dataset.lucide;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('data-lucide',name);svg.setAttribute('aria-hidden','true');svg.classList.add('lucide','lucide-'+name);el.replaceWith(svg);});}};` });
      }
      if (url.hostname === 'api.telegram.org') {
        telegram.push(route.request().postDataJSON());
        return json({ ok: true });
      }
      if (url.hostname === 'api.groq.com') return json({ choices: [{ message: { content: JSON.stringify(person) } }] });
      if (url.hostname === 'provinces.open-api.vn') return json([{ name: url.pathname.includes('/w/') ? 'Phường Mới' : 'Tỉnh Mới', code: url.pathname.includes('/w/') ? 2 : 1, division_type: 'province' }]);
      if (url.hostname === 'tinhthanhpho.com') {
        if (route.request().method() === 'POST') {
          conversions.push(route.request().postDataJSON());
          return json({ data: { new: { fullAddress: '12 Đường Mẫu, Phường Mới, Tỉnh Mới' } } });
        }
        const ward = url.pathname.endsWith('/wards'), district = url.pathname.endsWith('/districts');
        return json({ data: [{ code: ward ? '3' : district ? '2' : '1', name: 'Mẫu', type: ward ? 'Phường' : district ? 'Huyện' : 'Tỉnh' }] });
      }
      if (url.pathname.includes('tesseract')) return route.fulfill({ contentType: 'text/javascript', body: `window.Tesseract={recognize:async()=>({data:{text:${JSON.stringify('Số CCCD: 091213006838\nHọ và tên: NGƯỜI KIỂM THỬ\nNgày sinh: 01/01/1990\nGiới tính: Nam\nNơi thường trú: 12 Đường Mẫu, Phường Mẫu, Huyện Mẫu, Tỉnh Mẫu\nNgày cấp CCCD: 01/01/2020')}}})};` });
      // XLSX deliberately unavailable to exercise the real CSV fallback first.
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const count = () => page.evaluate(() => loadTmpRows().length);
    const visibleRoom = () => page.locator('#roomModal').isVisible();
    const ready = async () => {
      await page.waitForFunction(() => !document.getElementById('btnSaveTmp').disabled);
    };
    const fresh = async () => {
      await page.goto(base);
      await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
      await page.reload();
      await page.locator('#rawInput').fill(raw);
      await page.locator('#btnParse').click();
      await ready();
    };
    await fresh();
    assert.equal(await page.locator('#btnCopyAll svg.lucide-copy').count(), 1);
    await page.locator('#btnCopyAll').click();
    await page.locator('#toast svg.lucide-circle-check').waitFor();
    assert.equal(await page.locator('#cccdDigitBadge').textContent(), '12/12');
    assert.equal(await page.locator('#cccdDigitBadge svg.lucide-check').count(), 1);
    assert.equal(await page.locator('#cccdDigitBadge').getAttribute('data-state'), 'valid');
    assert.deepEqual(conversions[0], { provinceCode: '1', districtCode: '2', wardCode: '3', streetAddress: '12 Đường Mẫu' });
    passed.push('Manual QR parse and automatic address conversion payload');


    await page.locator('#btnSaveTmp').focus();
    await page.keyboard.press('Control+s');
    assert(await visibleRoom());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'roomModalInput');
    await page.keyboard.type('22');
    await page.keyboard.press('Enter');
    assert.equal(await count(), 1);
    assert.equal(await page.evaluate(() => loadTmpRows()[0]['Phòng']), '22');
    assert(!(await visibleRoom()));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnSaveTmp');
    await page.keyboard.down('Enter'); // A fresh press may open the flow again.
    await page.keyboard.down('Enter'); // Repeated Enter must not confirm it.
    await page.keyboard.up('Enter');
    assert.equal(await count(), 1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Escape');
    assert.equal(await count(), 1);
    await page.keyboard.press('Control+s');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.equal(await count(), 2);
    assert(!(await visibleRoom()));
    passed.push('Cases 1–3: Ctrl+S, room 22, Enter exactly once, Esc, held Enter');

    await page.locator('#rawInput').focus();
    await page.keyboard.press('End');
    const before = await page.locator('#rawInput').inputValue();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#rawInput').inputValue(), before + '\n');
    // Existing conversion throttle is 800ms; isolate keyboard assertions from it.
    await page.evaluate(() => { lastConvertAt = 0; });
    await page.locator('#btnParse').click();
    await ready();
    await page.keyboard.press('Control+s');
    assert(await page.locator('.wrap').evaluate(el => el.inert));
    await page.locator('#btnRoomSave').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnCloseRoomModal');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnRoomSave');
    await page.keyboard.press('Control+s');
    assert.equal(await count(), 2);
    await page.keyboard.press('Escape');
    passed.push('Cases 4–5: textarea newline, modal isolation and focus loop');

    for (const [cccd, badge, state] of [['09121300683','11/12','short'], ['0912130068389','13/12','long'], ['09 1213-006838','12/12','valid'], ['', '0/12','empty']]) {
      await page.evaluate(cccd => fillInfo({ cccd }), cccd);
      assert.equal(await page.locator('#cccdDigitBadge').textContent(), badge);
      assert.equal(await page.locator('#cccdDigitBadge').getAttribute('data-state'), state);
    }
    await page.locator('#btnClear').click();
    assert.equal(await page.locator('#cccdDigitBadge').textContent(), '0/12');
    passed.push('Cases 6–8: digit-only 0/11/12/13 counts and Clear');

    await page.locator('#btnShortcuts').click();
    assert.equal(await page.locator('#shortcutList input').count(), 0);
    await page.locator('#shortcut-assign-telegram').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shortcutAssignInput');
    assert(await page.locator('#shortcutModal').evaluate(el => el.inert));
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#shortcutAssignMessage').textContent(), 'Ctrl + S đã được dùng cho Lưu tạm.');
    await page.keyboard.press('Escape');
    assert(await page.locator('#shortcutModal').isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'shortcut-assign-telegram');
    assert.equal(await page.locator('#shortcut-telegram').textContent(), 'Chưa gán');
    await page.locator('#shortcut-assign-saveTemp').click();
    await page.locator('#shortcutAssignInput').fill('Ctrl+W');
    await page.keyboard.press('Enter');
    assert((await page.locator('#shortcutAssignMessage').textContent()).includes('dành cho trình duyệt'));
    await page.locator('#shortcutAssignInput').fill('Ctrl+Shift+S');
    await page.keyboard.press('Enter');
    assert((await page.locator('#shortcutMessage').textContent()).includes('Đã lưu'));
    await page.keyboard.press('Escape');
    await page.reload();
    assert.equal(await page.locator('#btnSaveTmp kbd').textContent(), 'Ctrl + Shift + S');
    await page.locator('#rawInput').fill(raw);
    await page.locator('#btnParse').click();
    await ready();
    await page.keyboard.press('Control+Shift+s');
    assert(await visibleRoom());
    await page.keyboard.press('Escape');
    await page.locator('#btnShortcuts').click();
    await page.locator('#shortcut-delete-saveTemp').click();
    assert.equal(await page.locator('#shortcut-saveTemp').textContent(), 'Chưa gán');
    assert.equal(await page.locator('#btnSaveTmp kbd').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cccd_keyboard_shortcuts_v1')).saveTemp), '');
    assert(await page.locator('#shortcut-delete-saveTemp').isDisabled());
    await page.locator('#btnResetShortcuts').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+s');
    assert(await visibleRoom());
    await page.keyboard.press('Escape');
    passed.push('Cases 9–10: custom binding works after reload, conflicts, reserved keys, reset');

    await page.locator('#rawInput').focus();
    const imeCancelled = await page.evaluate(() => !document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true })));
    assert.equal(imeCancelled, false);
    assert(!(await visibleRoom()));
    await page.keyboard.down('Control');
    await page.keyboard.down('s');
    await page.keyboard.down('s');
    await page.keyboard.up('s');
    await page.keyboard.up('Control');
    assert(await visibleRoom());
    await page.keyboard.press('Escape');
    passed.push('IME composition ignored and repeated Ctrl+S isolated');

    await page.locator('#btnSendTelegram').click();
    assert.equal(await page.locator('#btnRoomSave').textContent(), 'Gửi Telegram');
    await page.keyboard.press('Escape');
    assert.equal(telegram.length, 0);
    await page.keyboard.press('Control+s');
    assert.equal(await page.locator('#btnRoomSave').textContent(), 'Lưu');
    await page.locator('#btnRoomSkip').click();
    assert.equal(await count(), 3);
    assert.equal(telegram.length, 0);
    await page.locator('#btnSendTelegram').click();
    await page.locator('#roomModalInput').fill('22');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await page.waitForFunction(() => !roomConfirmBusy);
    assert.equal(telegram.length, 1);
    assert(telegram[0].text.includes('<strong>22</strong>'));
    assert.equal(await count(), 3);
    await page.locator('#tmpBody .miniBtn').filter({ hasText: /^Tele$/ }).first().click();
    await page.waitForTimeout(50);
    assert.equal(telegram.length, 2);
    await page.locator('[data-copy="#cccd"]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), person.cccd);
    await page.locator('#btnCopyAll').click();
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('CCCD: 091213006838'));
    passed.push('Telegram context cancel/save/confirm, single-row send (mock), field/all clipboard');

    const originalRows = await page.evaluate(() => loadTmpRows());
    assert.equal(await page.locator('[data-copy-row="0"] svg.lucide-copy').count(), 1);
    await page.locator('[data-copy-row="0"]').click();
    const copiedRow = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(copiedRow.split(/\r?\n/).length, 1);
    assert.deepEqual(copiedRow.split('\t'), columns.map(column => originalRows[0][column] ?? ''));

    await page.locator('[data-edit-row="0"]').click();
    await page.locator('#editTmpField7').fill('99');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => loadTmpRows()), originalRows);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.editRow), '0');
    await page.locator('[data-edit-row="0"]').click();
    await page.locator('#editTmpField0').fill('');
    await page.keyboard.press('Enter');
    assert(await page.locator('#editTmpModal').isVisible());
    assert.equal(await page.locator('#editTmpError').textContent(), 'Vui lòng nhập Họ tên.');
    await page.locator('#editTmpField0').fill('NGƯỜI ĐÃ SỬA');
    await page.locator('#editTmpField7').fill('33');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    const editedRows = await page.evaluate(() => loadTmpRows());
    assert.equal(editedRows.length, originalRows.length);
    assert.deepEqual(editedRows[0], { ...originalRows[0], 'Họ tên': 'NGƯỜI ĐÃ SỬA', 'Phòng': '33' });
    assert.deepEqual(editedRows.slice(1), originalRows.slice(1));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.editRow), '0');
    assert.equal(await page.locator('#name').textContent(), person.name);
    assert((await page.evaluate(() => buildTelegramMessageFromRow(loadTmpRows()[0]))).includes('NGƯỜI ĐÃ SỬA'));
    passed.push('Edit temporary row: cancel, required fields, Enter once, preserve other rows and current scan, updated Telegram payload');

    await page.locator('#btnCopyTmpAll').click();
    const copiedTable = await page.evaluate(() => navigator.clipboard.readText());
    const copiedLines = copiedTable.split(/\r?\n/);
    assert.deepEqual(copiedLines[0].split('\t'), columns);
    assert.equal(copiedLines.length, editedRows.length + 1);
    assert.deepEqual(copiedLines[1].split('\t'), columns.map(column => editedRows[0][column] ?? ''));
    assert.equal(await page.evaluate(() => toExcelClipboard([{ 'Họ tên': 'A\tB\nC' }], false).split('\t')[0]), 'A B C');
    passed.push('Copy one row without header and full table with header as Excel-compatible TSV');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnExportExcelInTable').click();
    const download = await downloadPromise;
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert(csv.startsWith('\ufeffHọ tên,Số CCCD'));
    assert(csv.includes('091213006838'));
    assert(csv.includes('NGƯỜI ĐÃ SỬA'));
    await page.evaluate(() => {
      window.XLSX = { utils: { json_to_sheet: (rows, options) => { window.exported = { rows, options }; return {}; }, book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
    });
    await page.locator('#btnExportExcelInTable').click();
    assert.deepEqual(await page.evaluate(() => window.exported.options.header), ['Họ tên','Số CCCD','Ngày sinh','Giới tính','Tỉnh/TP','Xã/Phường/Đặc khu','Số nhà/Ấp/KP/Đường','Phòng']);
    assert.equal(await page.evaluate(() => window.exported.rows.length), 3);
    await page.locator('#tmpBody .danger').first().click();
    assert.equal(await count(), 2);
    await page.locator('#btnClearTmpAll').click();
    assert(await page.locator('#confirmModal').isVisible());
    assert((await page.locator('#confirmModalMessage').textContent()).includes('Xóa toàn bộ'));
    await page.locator('#btnConfirmCancel').click();
    assert.equal(await count(), 2);
    await page.locator('#btnClearTmpAll').click();
    await page.locator('#btnConfirmAccept').click();
    assert.equal(await count(), 0);
    const clipboardBeforeEmptyCopy = await page.evaluate(() => navigator.clipboard.readText());
    await page.locator('#btnCopyTmpAll').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), clipboardBeforeEmptyCopy);
    passed.push('CSV actual download, XLSX contract, delete one/all temporary rows');

    await page.locator('#btnGoCT01').click();
    await page.waitForURL('**/ct01.html');
    assert.equal(await page.locator('#idNumber').inputValue(), person.cccd);
    assert.equal(await page.locator('#fullName').inputValue(), person.name);
    assert.equal(await page.locator('#tempAddress').inputValue(), 'Tổ 4B, KP1, Phường Bình Cơ, TP.Hồ Chí Minh');
    assert(!(await page.locator('#tempAddress').inputValue()).includes('Đường Mẫu'));
    assert((await page.locator('#a4').textContent()).includes(person.name));
    await page.locator('#btnReset').click();
    assert(await page.locator('#appPopup').isVisible());
    assert.equal(await page.locator('#appPopupTitle').textContent(), 'Xác nhận xóa dữ liệu');
    await page.locator('#appPopupCancel').click();
    assert.equal(await page.locator('#fullName').inputValue(), person.name);
    await page.locator('#jsonFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
    await page.locator('#appPopup').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#appPopupTitle').textContent(), 'Không thể nạp dữ liệu');
    await page.locator('#appPopupAccept').click();
    assert.deepEqual(await page.locator('#householdHeadSuggestions option').evaluateAll(options => options.map(option => option.value)), [
      'NGUYỄN VĂN XUÂN CHUÂN', 'NGUYỄN THỊ NGUYỆT', 'NGUYỄN MINH TUẤN'
    ]);
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${base}/ct01.html`);
    assert.equal(await page.locator('#tempAddress').inputValue(), 'Tổ 4B, KP1, Phường Bình Cơ, TP.Hồ Chí Minh');
    passed.push('CT01 navigation, prefill, preview');
    await fresh();
    await page.evaluate(() => { lastConvertAt = 0; });
    await page.locator('#btnClear').click();
    await page.locator('#btnStart').click();
    assert(await page.evaluate(() => window.scanStarted));
    await page.locator('#btnStop').click();
    assert.equal(await page.evaluate(() => window.scanStarted), false);
    await page.locator('#btnStart').click();
    await page.evaluate(raw => window.scanCallback(raw), raw);
    await ready();
    assert.equal(await page.locator('#cccdDigitBadge').textContent(), '12/12');
    await page.locator('#btnClear').click();
    await page.evaluate(() => { lastConvertAt = 0; });
    await page.locator('#qrFile').setInputFiles({ name: 'qr-fixture.png', mimeType: 'image/png', buffer: png });
    await ready();
    assert.equal(await page.locator('#cccd').textContent(), person.cccd);
    passed.push('Camera start/stop/success callback and QR upload (scanner mock)');
    for (const key of ['', 'test-only-key']) {
      await page.locator('#btnClear').click();
      await page.evaluate(() => { lastConvertAt = 0; });
      await page.locator('#tabOcrBtn').click();
      await page.locator('#groqKey').fill(key);
      await page.locator('#idFile').setInputFiles({ name: 'ocr-fixture.png', mimeType: 'image/png', buffer: png });
      await ready();
      assert.equal(await page.locator('#cccdDigitBadge').textContent(), '12/12');
      await page.locator('#btnOcrClear').click();
      assert.equal(await page.locator('#reader img').count(), 0);
    }
    passed.push('Groq OCR and Tesseract fallback (mock responses), OCR clear image');

    await page.locator('#mode').selectOption('manual-new');
    await page.locator('#manualProvinceSelect').fill('Tỉnh Mới');
    await page.locator('#manualProvinceSelect').dispatchEvent('change');
    await page.waitForFunction(() => !document.getElementById('manualWardSelect').disabled);
    await page.locator('#manualWardText').fill('Phường Mới');
    await page.locator('#manualStreetText').fill('22 Đường Mẫu');
    await page.locator('#btnApplyManualNewAddress').click();
    assert.equal(await page.locator('#addrStreet').textContent(), '22 Đường Mẫu');
    await page.locator('#mode').selectOption('manual-old');
    for (const id of ['oldProvinceSearch','oldDistrictSearch','oldWardSearch']) {
      await page.locator(`#${id}`).fill(id === 'oldProvinceSearch' ? 'Tỉnh Mẫu' : id === 'oldDistrictSearch' ? 'Huyện Mẫu' : 'Phường Mẫu');
      await page.locator(`#${id}`).press('Tab');
    }
    await page.locator('#streetAddress').fill('22 Đường Mẫu');
    await page.evaluate(() => { lastConvertAt = 0; });
    await page.locator('#btnConvertOldManual').click();
    await ready();
    assert.equal(conversions.at(-1).streetAddress, '22 Đường Mẫu');
    passed.push('Manual new address and old address selection/conversion');

    fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
    for (const [width, height] of [[1920,1080],[1366,768],[768,1024],[390,844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#mode').selectOption('smart');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
      await page.locator('#btnShortcuts').click();
      assert(await page.locator('#shortcutModal .modal').evaluate(el => el.scrollWidth <= el.clientWidth), `Settings overflow at ${width}`);
      await page.screenshot({ path: path.join(root, `test-artifacts/shortcuts-${width}.png`) });
      await page.locator('#shortcut-assign-saveTemp').click();
      assert(await page.locator('#shortcutAssignModal .modal').evaluate(el => el.scrollWidth <= el.clientWidth), `Assignment overflow at ${width}`);
      await page.screenshot({ path: path.join(root, `test-artifacts/shortcut-assign-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+s');
      assert(await visibleRoom());
      await page.screenshot({ path: path.join(root, `test-artifacts/room-${width}.png`) });
      await page.keyboard.press('Escape');
    }
    passed.push('Responsive: 1920×1080, 1366×768, 768px, 390px; screenshots and overflow assertions');
    await page.locator('.nav-toggle').click();
    assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => localStorage.setItem('cccd_keyboard_shortcuts_v1', '{broken'));
    await page.reload();
    assert.equal(await page.locator('#btnSaveTmp kbd').textContent(), 'Ctrl + S');
    await page.locator('#rawInput').focus();
    const prevented = await page.evaluate(() => !document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })));
    assert(prevented);
    assert(!(await visibleRoom()));
    passed.push('Mobile nav Escape, corrupt settings fallback and disabled save prevents browser Save Page');
    assert.deepEqual(errors, []);
    console.log(passed.map(name => `PASS ${name}`).join('\n'));
    console.log(`PASS ${passed.length} groups; no JavaScript page errors; all external traffic mocked.`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
