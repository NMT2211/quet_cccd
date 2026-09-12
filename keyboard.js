/* Keyboard routing and modal focus are owned here; actions reuse existing buttons. */
const ModalController = (() => {
  let active = null;
  function close() {
    if (!active) return;
    const previous = active;
    active = previous.parent;
    previous.overlay.style.display = "none";
    previous.overlay.inert = previous.inert;
    previous.background.forEach(([el, inert]) => { el.inert = inert; });
    document.body.style.overflow = previous.overflow;
    previous.onClose?.();
    const target = previous.opener;
    if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
  }
  function open(overlay, { initialFocus, onConfirm, onClose, opener = document.activeElement, nested = false } = {}) {
    if (active && !nested) return false;
    const background = [...document.body.children]
      .filter(el => el !== overlay && !["SCRIPT", "STYLE"].includes(el.tagName) && el.id !== "toast")
      .map(el => [el, el.inert]);
    active = { overlay, onConfirm, onClose, opener, background, parent: active, inert: overlay.inert, overflow: document.body.style.overflow };
    overlay.inert = false;
    overlay.style.display = "flex";
    background.forEach(([el]) => { el.inert = true; });
    document.body.style.overflow = "hidden";
    initialFocus?.focus();
    return true;
  }
  function route(event) {
    if (!active) return false;
    const { overlay, onConfirm } = active;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && !event.isComposing) close();
      return true;
    }
    if (event.key === "Enter" && onConfirm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && !event.isComposing && event.keyCode !== 229) onConfirm();
      return true;
    }
    if (event.key === "Tab") {
      const items = [...overlay.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    if (!overlay.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return true;
  }
  return { open, close, route, get active() { return active?.overlay || null; } };
})();

const ShortcutManager = (() => {
  const STORAGE_KEY = "cccd_keyboard_shortcuts_v1";
  const actions = [
    { id: "saveTemp", label: "Lưu tạm", button: "btnSaveTmp", defaultKey: "Ctrl+S" },
    { id: "parse", label: "Parse + chuyển đổi", button: "btnParse" },
    { id: "startScan", label: "Bắt đầu quét", button: "btnStart" },
    { id: "stopScan", label: "Dừng quét", button: "btnStop" },
    { id: "telegram", label: "Gửi Telegram", button: "btnSendTelegram" },
    { id: "ct01", label: "Điền CT01", button: "btnGoCT01" },
    { id: "copyAll", label: "Copy tất cả", button: "btnCopyAll" },
    { id: "excel", label: "Xuất Excel", button: "btnExportExcelInTable" }
  ];
  const defaults = Object.fromEntries(actions.map(a => [a.id, a.defaultKey || ""]));
  let settings = { ...defaults }, notify = () => {}, initialized = false;
  const byId = id => document.getElementById(id);
  const display = key => key.split("+").join(" + ");
  function normalizeShortcut(value) {
    const parts = value.replace(/\s/g, "").split("+");
    const key = parts.pop()?.toUpperCase();
    const modifiers = parts.map(p => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" })[p.toLowerCase()]);
    if (!/^[A-Z0-9]$/.test(key || "") || !modifiers.length || modifiers.includes(undefined)
      || new Set(modifiers).size !== modifiers.length || !modifiers.some(m => m !== "Shift")) return null;
    return [...["Ctrl", "Alt", "Shift", "Meta"].filter(m => modifiers.includes(m)), key].join("+");
  }
  function fromEvent(event) {
    if (event.getModifierState?.("AltGraph")) return null;
    return normalizeShortcut([
      event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta", event.key
    ].filter(Boolean).join("+"));
  }
  function reserved(key) {
    const parts = key.split("+"), letter = parts.at(-1);
    // Preserve browser navigation, editing, tab/window controls and developer tools.
    if (parts.includes("Ctrl") || parts.includes("Meta")) {
      if ("WRTNPQLOHJFACVXYZ".includes(letter) || /[0-9]/.test(letter)) return true;
      if (parts.includes("Shift") && "IBD".includes(letter)) return true;
      if (parts.includes("Alt")) return true;
    }
    return parts.includes("Alt") && (parts.includes("Meta") || "DFE".includes(letter));
  }
  function isEditableTarget(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  }
  function validate(id, key, against = settings) {
    if (!key) return "";
    if (reserved(key)) return `${display(key)} được dành cho trình duyệt hoặc hệ điều hành. Hãy chọn tổ hợp khác.`;
    const conflict = actions.find(a => a.id !== id && against[a.id] === key);
    return conflict ? `${display(key)} đã được dùng cho ${conflict.label}.` : "";
  }
  function loadShortcutSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error();
      const next = { ...defaults };
      for (const action of actions) {
        if (!Object.hasOwn(saved, action.id)) continue;
        const value = saved[action.id];
        if (typeof value !== "string") throw new Error();
        next[action.id] = value === "" ? "" : normalizeShortcut(value);
        if (next[action.id] === null) throw new Error();
      }
      if (actions.some(a => validate(a.id, next[a.id], next))) throw new Error();
      settings = next;
    } catch { notify("Không đọc được cấu hình phím tắt; đang dùng mặc định."); }
  }
  function saveShortcutSettings(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { return "Không lưu được phím tắt. Hãy kiểm tra quyền lưu trữ của trình duyệt."; }
    settings = next;
    renderHints();
    return "";
  }
  function renderHints() {
    for (const action of actions) {
      const button = byId(action.button), key = settings[action.id];
      button.querySelector(".shortcutHint")?.remove();
      button.removeAttribute("aria-keyshortcuts");
      if (!key) continue;
      const hint = document.createElement("kbd");
      hint.className = "shortcutHint";
      hint.textContent = display(key);
      hint.setAttribute("aria-hidden", "true");
      button.append(hint);
      button.setAttribute("aria-keyshortcuts", key.replace("Ctrl", "Control"));
    }
  }
  function setMessage(message, error = false) {
    const el = byId(ModalController.active?.id === "shortcutAssignModal" ? "shortcutAssignMessage" : "shortcutMessage");
    el.textContent = message;
    el.classList.toggle("error", error);
  }
  function applySetting(id) {
    const input = byId("shortcutAssignInput"), value = input.value.trim();
    const key = value ? normalizeShortcut(value) : "";
    const error = key === null ? "Dùng Ctrl, Alt hoặc Meta cùng một chữ/số, ví dụ Ctrl + Shift + S."
      : validate(id, key) || saveShortcutSettings({ ...settings, [id]: key });
    input.setAttribute("aria-invalid", String(!!error));
    if (error) { setMessage(error, true); return; }
    updateSettingRow(id);
    ModalController.close();
    setMessage("Đã lưu phím tắt.");
  }
  function updateSettingRow(id) {
    byId(`shortcut-${id}`).textContent = display(settings[id]) || "Chưa gán";
    byId(`shortcut-delete-${id}`).disabled = !settings[id];
  }
  function openAssignment(action, opener) {
    const input = byId("shortcutAssignInput");
    input.value = display(settings[action.id]);
    input.dataset.shortcutAction = action.id;
    input.removeAttribute("aria-invalid");
    byId("shortcutAssignTitle").textContent = `Gán phím tắt: ${action.label}`;
    byId("shortcutAssignMessage").textContent = "";
    ModalController.open(byId("shortcutAssignModal"), {
      nested: true, opener, initialFocus: input,
      onConfirm: () => applySetting(action.id)
    });
    input.select();
  }
  function renderSettings() {
    const list = byId("shortcutList");
    list.replaceChildren();
    for (const action of actions) {
      const row = document.createElement("div");
      row.className = "shortcutRow";
      const label = document.createElement("span");
      label.className = "shortcutLabel";
      label.textContent = action.label;
      const value = document.createElement("span");
      value.id = `shortcut-${action.id}`;
      value.className = "shortcutValue mono";
      value.textContent = display(settings[action.id]) || "Chưa gán";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "miniBtn";
      button.textContent = "Gán";
      button.id = `shortcut-assign-${action.id}`;
      button.setAttribute("aria-label", `Gán phím tắt cho ${action.label}`);
      button.addEventListener("click", () => openAssignment(action, button));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "miniBtn danger";
      remove.id = `shortcut-delete-${action.id}`;
      remove.textContent = "Xóa";
      remove.disabled = !settings[action.id];
      remove.setAttribute("aria-label", `Xóa phím tắt cho ${action.label}`);
      remove.addEventListener("click", () => {
        const error = saveShortcutSettings({ ...settings, [action.id]: "" });
        if (!error) { updateSettingRow(action.id); button.focus(); }
        setMessage(error || `Đã xóa phím tắt cho ${action.label}.`, !!error);
      });
      const buttons = document.createElement("div");
      buttons.className = "shortcutRowActions";
      buttons.append(button, remove);
      row.append(label, value, buttons);
      list.append(row);
    }
  }
  function executeShortcut(action) {
    const button = byId(action.button);
    if (button.disabled) { notify(`${action.label} chưa sẵn sàng. Hãy kiểm tra dữ liệu và trạng thái hiện tại.`); return; }
    button.click();
    if (action.id === "saveTemp" && ModalController.active?.id === "roomModal") notify("✓ Đã mở lưu tạm");
  }
  function handleKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.repeat && event.key === "Enter" && event.target.closest?.("button")) {
      event.preventDefault();
      return;
    }
    if (ModalController.active) {
      if (ModalController.route(event) && (event.defaultPrevented || event.key === "Escape")) return;
      if (ModalController.active?.id === "shortcutAssignModal") {
        const id = event.target.dataset?.shortcutAction;
        if (id && event.key === "Enter") {
          event.preventDefault();
          if (!event.repeat) applySetting(id);
          return;
        }
        const key = fromEvent(event);
        if (id && key) {
          if (/^(Ctrl|Meta)\+[ACVXYZ]$/.test(key)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) {
            if (reserved(key)) setMessage(validate(id, key), true);
            else { event.target.value = display(key); setMessage("Nhấn Enter hoặc Gán để lưu tổ hợp này."); }
          }
          return;
        }
      }
      // Modal owns context: no page shortcut can run behind it.
      if (fromEvent(event) && actions.some(a => settings[a.id] === fromEvent(event))) event.preventDefault();
      return;
    }
    const nav = document.querySelector(".site-nav.open");
    if (event.key === "Escape" && nav) {
      event.preventDefault();
      nav.classList.remove("open");
      const toggle = nav.querySelector(".nav-toggle");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.focus();
      return;
    }
    if (event.defaultPrevented || event.target.closest?.('dialog[open], [aria-expanded="true"][role="combobox"]')) return;
    if (isEditableTarget(event.target) && !(event.ctrlKey || event.altKey || event.metaKey)) return;
    const key = fromEvent(event);
    const action = key && actions.find(a => settings[a.id] === key);
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) executeShortcut(action);
  }
  function init(toast) {
    if (initialized) return;
    initialized = true;
    notify = toast;
    loadShortcutSettings();
    renderHints();
    byId("btnShortcuts").addEventListener("click", () => {
      renderSettings();
      setMessage("");
      ModalController.open(byId("shortcutModal"), { initialFocus: byId("shortcut-assign-saveTemp") });
    });
    byId("btnCancelShortcutAssign").addEventListener("click", ModalController.close);
    byId("btnSaveShortcutAssign").addEventListener("click", () => applySetting(byId("shortcutAssignInput").dataset.shortcutAction));
    byId("shortcutAssignModal").addEventListener("click", e => { if (e.target === byId("shortcutAssignModal")) ModalController.close(); });
    byId("btnCloseShortcuts").addEventListener("click", ModalController.close);
    byId("shortcutModal").addEventListener("click", e => { if (e.target === byId("shortcutModal")) ModalController.close(); });
    byId("btnResetShortcuts").addEventListener("click", () => {
      const error = saveShortcutSettings({ ...defaults });
      if (!error) renderSettings();
      setMessage(error || "Đã khôi phục mặc định: Ctrl + S → Lưu tạm.", !!error);
    });
    document.addEventListener("keydown", handleKeydown, true);
  }
  return { init };
})();
