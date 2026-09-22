// 页面交互：渲染、事件与本地持久化。拆版规则见 dismantle.js，库存状态见 inventory.js。
const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  dismantle: { order: null, history: [] },
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();
let selectedCell = null;
let noticeTimer = null;

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  notice: document.querySelector("#notice"),
  dismantleHint: document.querySelector("#dismantleHint"),
  createDismantleBtn: document.querySelector("#createDismantleBtn"),
  dismantleActive: document.querySelector("#dismantleActive"),
  dismantleProgress: document.querySelector("#dismantleProgress"),
  dismantleCells: document.querySelector("#dismantleCells"),
  registerForm: document.querySelector("#registerForm"),
  registerTarget: document.querySelector("#registerTarget"),
  lostFields: document.querySelector("#lostFields"),
  responsibleInput: document.querySelector("#responsibleInput"),
  noteInput: document.querySelector("#noteInput"),
  dismantleHistory: document.querySelector("#dismantleHistory")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings },
      dismantle: { ...structuredClone(defaultState.dismantle), ...(parsed.dismantle || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function showNotice(text, tone = "info") {
  els.notice.textContent = text;
  els.notice.className = `notice ${tone}`;
  els.notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    els.notice.hidden = true;
  }, 3200);
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function cellStatusClass(status) {
  if (status === "pending") return "pending";
  if (status === "lost") return "lost";
  return "returned";
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = InventoryStock.usage(state);
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const order = state.dismantle.order;
  const frozen = Boolean(order);
  const map = new Map();
  if (frozen) {
    order.cells.forEach((cell) => map.set(placementKey(cell.row, cell.col), cell));
  } else {
    state.placements.forEach((item) => map.set(placementKey(item.row, item.col), item));
  }
  els.stage.className = `stage ${state.settings.paperSize}${frozen ? " frozen" : ""}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const entry = map.get(placementKey(row, col));
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      let cls = "";
      let char = "";
      if (entry && frozen) {
        char = entry.char;
        cls = cellStatusClass(entry.status);
        if (selectedCell && selectedCell.row === row && selectedCell.col === col) cls += " selected";
      } else if (entry) {
        const type = state.inventory.find((item) => item.id === entry.typeId);
        char = type ? type.char : "";
        cls = "used";
      }
      cells.push(`
        <button class="cell ${cls} ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${escapeHtml(char)}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderUsage() {
  const usage = InventoryStock.usage(state);
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = InventoryStock.shortages(state);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  if (InventoryStock.isFrozen(state)) {
    els.selectedTypeLabel.textContent = "拆版归库中 · 点击待归还格子逐格登记";
  } else {
    const selectedType = getSelectedType();
    els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";
  }

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;
}

function renderDismantle() {
  const order = state.dismantle.order;
  els.createDismantleBtn.hidden = Boolean(order);
  els.dismantleActive.hidden = !order;

  if (!order) {
    const check = DismantleRules.canCreate(state, InventoryStock.shortages(state));
    els.dismantleHint.textContent = check.ok ? "作品名与字模数量核对通过，可以建单拆版。" : check.reason;
    els.dismantleHint.className = `dismantle-hint ${check.ok ? "ok" : "warn"}`;
  } else {
    const { done, total } = DismantleRules.progress(order);
    const summary = DismantleRules.summarize(order);
    els.dismantleProgress.innerHTML = `
      <strong>${escapeHtml(order.title)}</strong>
      <span>已登记 ${done}/${total} 格 · 完好${summary.intact} 磨损${summary.worn} 遗失${summary.lost}</span>
      <div class="progress-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    `;
    els.dismantleCells.innerHTML = order.cells
      .map((cell) => {
        const selected = selectedCell && selectedCell.row === cell.row && selectedCell.col === cell.col ? "selected" : "";
        const statusLabel = cell.status === "pending" ? "待归还" : DismantleRules.CONDITIONS[cell.status].label;
        return `<button type="button" class="chip ${cellStatusClass(cell.status)} ${selected}" data-cell-row="${cell.row}" data-cell-col="${cell.col}" title="第${cell.row + 1}行第${cell.col + 1}列 · ${statusLabel}">${escapeHtml(cell.char)}</button>`;
      })
      .join("");

    const current = selectedCell ? DismantleRules.findCell(order, selectedCell.row, selectedCell.col) : null;
    els.registerForm.hidden = !current;
    if (current) {
      els.registerTarget.textContent = `登记：${current.char} · 第${current.row + 1}行第${current.col + 1}列`;
    }
  }

  els.dismantleHistory.innerHTML = state.dismantle.history.length
    ? `<p class="history-title">最近拆版</p>` +
      state.dismantle.history
        .map((item) => {
          const summary = DismantleRules.summarize(item);
          return `
            <article class="history-item">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${new Date(item.finishedAt).toLocaleString("zh-CN")} · 完好${summary.intact} · 磨损${summary.worn} · 遗失${summary.lost}</span>
            </article>
          `;
        })
        .join("")
    : "";
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderDismantle();
  renderDrafts();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (InventoryStock.isFrozen(state)) {
    showNotice("拆版单未结束，版面已冻结", "error");
    return;
  }
  if (!typeId) return;
  const existingIndex = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (existingIndex >= 0) {
    if (state.placements[existingIndex].typeId === typeId) {
      state.placements.splice(existingIndex, 1);
    } else {
      state.placements[existingIndex].typeId = typeId;
    }
  } else {
    state.placements.push({ row, col, typeId });
  }
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
}

function createDismantle() {
  const check = DismantleRules.canCreate(state, InventoryStock.shortages(state));
  if (!check.ok) {
    showNotice(check.reason, "error");
    return;
  }
  state.dismantle.order = DismantleRules.buildOrder(state);
  selectedCell = null;
  showNotice("拆版单已生成，版面已冻结，请逐格登记归还", "success");
  renderAll();
}

function selectDismantleCell(row, col) {
  const order = state.dismantle.order;
  if (!order) return;
  const cell = DismantleRules.findCell(order, row, col);
  if (!cell) {
    showNotice("拆版中，版面已冻结，该格没有待归还字模", "error");
    return;
  }
  if (cell.status !== "pending") {
    showNotice("该格已登记，重复登记整单拒绝", "error");
    return;
  }
  selectedCell = { row, col };
  renderAll();
}

function submitRegistration(event) {
  event.preventDefault();
  const order = state.dismantle.order;
  if (!order || !selectedCell) return;
  const condition = new FormData(els.registerForm).get("condition");
  const meta = { responsible: els.responsibleInput.value, note: els.noteInput.value };
  const check = DismantleRules.validateRegistration(order, selectedCell.row, selectedCell.col, condition, meta);
  if (!check.ok) {
    showNotice(check.reason, "error");
    return;
  }
  const cell = DismantleRules.applyRegistration(order, selectedCell.row, selectedCell.col, condition, meta);
  InventoryStock.applyReturn(state, cell);
  selectedCell = null;
  els.registerForm.reset();
  toggleLostFields();
  if (DismantleRules.isComplete(order)) {
    finishOrder();
  } else {
    showNotice(`已登记：${cell.char} · ${DismantleRules.CONDITIONS[condition].label}`, "success");
  }
  renderAll();
}

function finishOrder() {
  const order = state.dismantle.order;
  InventoryStock.settleOrder(state, order);
  order.status = "done";
  order.finishedAt = new Date().toISOString();
  state.dismantle.history.unshift(order);
  state.dismantle.history = state.dismantle.history.slice(0, 5);
  state.dismantle.order = null;
  showNotice("全部格子登记完成，拆版单结束，版面已解冻", "success");
}

function toggleLostFields() {
  const condition = new FormData(els.registerForm).get("condition");
  els.lostFields.hidden = condition !== "lost";
}

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  if (InventoryStock.isFrozen(state)) {
    els.paperSize.value = state.settings.paperSize;
    showNotice("拆版单未结束，纸张不可更换", "error");
    return;
  }
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
  renderDismantle();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  if (InventoryStock.isFrozen(state)) {
    showNotice("拆版单未结束，版面已冻结，不能清空", "error");
    return;
  }
  state.placements = [];
  renderAll();
});

els.createDismantleBtn.addEventListener("click", createDismantle);
els.registerForm.addEventListener("submit", submitRegistration);
els.registerForm.addEventListener("change", (event) => {
  if (event.target.name === "condition") toggleLostFields();
});

els.dismantleCells.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-cell-row]");
  if (!chip) return;
  selectDismantleCell(Number(chip.dataset.cellRow), Number(chip.dataset.cellCol));
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const guard = InventoryStock.guardTypeChange(state);
    if (!guard.ok) {
      showNotice(guard.reason, "error");
      return;
    }
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (InventoryStock.isFrozen(state)) {
    selectDismantleCell(row, col);
    return;
  }
  placeType(row, col);
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    if (InventoryStock.isFrozen(state)) {
      showNotice("拆版单未结束，已保留当前版面", "error");
      return;
    }
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();
