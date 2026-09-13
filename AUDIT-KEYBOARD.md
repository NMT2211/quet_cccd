# Audit và nâng cấp keyboard UX

## Kiến trúc và phạm vi

Ứng dụng HTML/CSS/JavaScript thuần, không có build pipeline. `index.html` chứa UI và nghiệp vụ quét, OCR, parse, địa chỉ, bảng tạm, Telegram, Excel và truyền dữ liệu CT01. `style.css` định nghĩa giao diện chung; `nav.html` chứa menu; `script.js` tải và điều khiển menu. `ct01.html` là ứng dụng nhập liệu/preview/in riêng, nhận `ct01_prefill_v1` từ sessionStorage.

`assets/html5-qrcode.min.js` là thư viện QR đóng gói; những asset còn lại chủ yếu là ảnh/logo. Package hiện có là html5-qrcode 2.3.8. XLSX và Tesseract được tải qua CDN. `test.html` là bản HTML cổng DVC, phụ thuộc nhiều đường dẫn `/portal` và thư viện không có trong repository; đây không phải test runner và không tham gia flow của trang quét.

Flow: Camera hoặc upload QR → `onScanSuccess`; OCR → `runOcrFlow`; nhập tay → `parseManualInputNow` / `applyRawInputIfChanged`. Các nhánh dùng `fillInfo` để hiển thị CCCD rồi chuyển đổi địa chỉ. Các nút thông tin giữ cơ chế disabled hiện tại cho đến khi đủ điều kiện.

Lưu tạm: kiểm tra QR thủ công → `buildRowFromUI` kiểm tra CCCD, họ tên, tỉnh và xã/phường mới → modal phòng → `doSaveTmpWithRoom` → sessionStorage `cccd_convert_tmp_rows_v3` → render bảng. Phòng vẫn không bắt buộc. Không đổi schema bảng tạm, API địa chỉ, nội dung Telegram, thứ tự cột xuất hoặc flow CT01.

## Phát hiện trước khi sửa

- Modal có hai đường mở; đường Lưu tạm không reset mục đích Telegram. Sau Telegram → hủy → Lưu tạm, hành động có thể chạy sai.
- Modal chưa xử lý Enter/Esc, giữ focus, trả focus và ngăn tương tác phía sau. Menu có listener Esc riêng.
- `fillInfo` là nơi ghi CCCD tập trung, phù hợp cho counter mà không lẫn badge vào dữ liệu copy/xuất.
- API chuyển địa chỉ có throttle 800ms. Gọi Parse liên tiếp trong khoảng này có thể disable các nút rồi return trước khi bật lại. Giữ nguyên logic theo phạm vi yêu cầu; test bàn phím chủ động tách khỏi throttle này.
- Source đã chứa API key/token và `test.html` có dữ liệu cá nhân/phiên. Không đưa giá trị cụ thể vào báo cáo. Cần xử lý riêng việc thu hồi/thay key và loại dữ liệu nhạy cảm khỏi source công khai.

## Implementation

| File | Thay đổi |
| --- | --- |
| `index.html` | Counter CCCD, UI cấu hình phím tắt, mô tả/hint phòng, trạng thái toast, gom xác nhận modal và reset mục đích |
| `keyboard.js` | `ModalController` và `ShortcutManager`, một listener keydown tập trung |
| `script.js` | Chuyển Esc menu về manager |
| `style.css` | Badge, focus-visible, hint responsive, bố cục modal và thanh đóng cố định khi cuộn cấu hình |
| `tests/keyboard-regression.cjs` | Regression Chromium với toàn bộ external request được intercept |
| `.gitignore` | Bỏ qua screenshot được sinh trong `test-artifacts/` |

Bảng tạm có nút icon sao chép trên từng dòng để sao chép riêng dữ liệu dòng đó và nút **Sao chép bảng** trên thanh công cụ. Dữ liệu clipboard dùng TSV: tab phân cột, xuống dòng phân hàng; sao chép toàn bảng có tiêu đề, sao chép một dòng không có tiêu đề. Có thể dán trực tiếp vào Excel hoặc Google Sheets.

Bảng tạm hỗ trợ chọn một hoặc nhiều người, chọn tất cả, bỏ chọn tất cả và chuyển danh sách sang CT01 bằng `ct01_batch_prefill_v1`. Mỗi dòng được chuyển sang cùng schema prefill của flow một người qua `createCT01Prefill()`. Trang CT01 tiếp tục dùng duy nhất `buildCT01Html()` để dựng từng mẫu, ghép mỗi người thành một trang A4 riêng và ngắt trang khi in. Tên chủ hộ dùng chung được đồng bộ với mục 7 và phần chữ ký chủ hộ.

Icon giao diện của trang quét và CT01 dùng Lucide qua `https://unpkg.com/lucide@latest`. Icon tạo động trong toast, bảng tạm và danh sách thành viên được render lại sau khi DOM thay đổi; log kỹ thuật dùng nhãn chữ vì textarea không thể render SVG. Emoji trong nội dung gửi Telegram được giữ nguyên vì Telegram không sử dụng icon web của website.


Các hàm/thành phần mới:

- `ModalController.open/close/route`: focus đầu vào, inert nền, Tab/Shift+Tab, đóng và trả focus.
- `ShortcutManager`: chuẩn hóa event/tổ hợp; kiểm tra target editable; phát hiện trùng và tổ hợp dành cho trình duyệt; load/save settings; hiển thị hint; gọi lại button hiện tại. Các hàm nội bộ chính: `normalizeShortcut`, `fromEvent`, `isEditableTarget`, `validate`, `loadShortcutSettings`, `saveShortcutSettings`, `executeShortcut`, `handleKeydown`.
- `confirmRoomModal(skip)`: chung cho Lưu/Bỏ qua và Enter; có guard chống lặp, lấy callback Telegram trước khi cleanup modal.
- `handleSaveTemporary`: tách tên cho handler Lưu tạm hiện có.
- `updateCccdDigitStatus`: đếm `textContent.replace(/\D/g, "").length` ngay trong `fillInfo` và lúc boot. 12 số xanh; thiếu cam; thừa đỏ; trống neutral. Chỉ xác nhận “hợp lệ về độ dài”.

Refactor giới hạn tại `openRoomModal`, `openRoomModalFor`, `closeRoomModal`, handler Lưu/Bỏ qua và cleanup callback Telegram. Các shortcut gọi `.click()` trên nút hiện có và tôn trọng disabled, nên không sao chép business logic.

## Cách dùng

Mặc định **Ctrl + S → Lưu tạm**. Bảy hành động còn lại có trong bảng cấu hình nhưng chưa gán để giảm xung đột: Parse + chuyển đổi, Bắt đầu quét, Dừng quét, Gửi Telegram, Điền CT01, Copy tất cả, Xuất Excel.

Mở **⌨ Phím tắt** để xem danh sách chỉ đọc. Bấm **Gán** ở một dòng để mở popup nhập tổ hợp như `Ctrl + Shift + S`, rồi nhấn Enter hoặc Gán để lưu. **Xóa** cạnh nút Gán bỏ shortcut của dòng đó. Esc trong popup hủy thay đổi và trả focus về nút Gán trong danh sách. Tổ hợp phải gồm Ctrl/Alt/Meta cùng chữ/số, có thể thêm Shift. Cấu hình lưu tại localStorage `cccd_keyboard_shortcuts_v1`; nút Khôi phục mặc định trả Ctrl+S về Lưu tạm. Trùng tổ hợp báo tên hành động đang dùng, không ghi đè. Cấu hình hỏng dùng lại mặc định; lỗi ghi storage được báo thay vì giả vờ lưu thành công.

Khi modal phòng mở, **Enter luôn chạy nút chính**: Lưu hoặc Gửi Telegram, kể cả đang focus input phòng hay nút phụ. **Esc hủy**, không lưu/gửi. Bỏ qua chạy hành động không có phòng; để phòng trống rồi Enter cũng giữ hành vi cũ. Popup gán phím dùng Enter để xác nhận; trong danh sách, các nút giữ hành vi keyboard gốc.

Ngoài modal, Enter trong textarea xuống dòng bình thường. Modifier shortcut tôn trọng disabled. IME/AltGraph được bỏ qua, repeat không chạy lại side effect. Focus trả về phần tử mở modal sau khi đóng. Hint trên nút ẩn dưới 640px.

## Kiểm thử đã chạy

Chromium 153, Playwright Core có sẵn trong môi trường. Lệnh tái chạy:

```powershell
node tests/keyboard-regression.cjs D:/Projects/Extensions/Chrome_Control_Center/node_modules/playwright-core
```

Nếu `playwright-core` đã có trong module resolution của máy khác, dùng `node tests/keyboard-regression.cjs`; máy cần có Chromium tương thích với Playwright. Test tự mở server loopback, browser và tự đóng khi xong.

**14 nhóm PASS, không có JavaScript page error:**

1. Parse QR và payload tự chuyển địa chỉ.
2. Cases 1–3: Ctrl+S, phòng 22, Enter đúng một dòng, Esc và giữ Enter.
3. Cases 4–5: textarea xuống dòng, nền inert, Tab/Shift+Tab trong modal.
4. Cases 6–8: counter 0/11/12/13, ký tự không phải số, Clear.
5. Cases 9–10: cấu hình thực thi sau reload, phát hiện trùng, chặn tổ hợp reserved, reset.
6. IME và giữ Ctrl+S.
7. Telegram hủy/chuyển sang lưu/xác nhận đúng mục đích, gửi một dòng, copy field/all.
8. Tải CSV thực tế; kiểm tra contract XLSX, xóa một dòng và xóa hết bảng.
9. Chuyển CT01, nhận prefill và render preview.
10. Camera start/stop/success callback và upload QR qua scanner mock.
11. Groq OCR và Tesseract fallback qua mock, xóa ảnh OCR.
12. Địa chỉ cũ và mới nhập thủ công.
13. Responsive 1920×1080, 1366×768, 768×1024, 390×844; kiểm tra overflow và screenshot modal.
14. Esc menu mobile, cấu hình storage hỏng, Ctrl+S vẫn ngăn Save Page khi nút chưa sẵn sàng.

Đã chạy `node --check` cho JavaScript; parse inline script của index/CT01 bằng `vm.Script`; `git diff --check`. Đã xem ảnh screenshot mobile/desktop để sửa alignment và thanh Đóng/Khôi phục khi cuộn. Ảnh sinh tại `test-artifacts/`.

## Giới hạn kiểm chứng

Camera/QR decoder, OCR, Telegram và API địa chỉ dùng mock trong regression. Chưa kiểm chứng camera vật lý, độ chính xác OCR ảnh thật, dịch vụ ngoài đang hoạt động hay Telegram giao tin thật. XLSX kiểm tra contract truyền dữ liệu; CSV là download thực tế. Không gửi tin Telegram thật trong test. Website live chưa được cập nhật; thay đổi đang nằm trong workspace.
