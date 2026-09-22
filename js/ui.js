// 页面交互：渲染、事件绑定、冻结态守卫与冲突提示
(function () {
  const { state } = window.Store;

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
    freezeBanner: document.querySelector("#freezeBanner"),
    dismantlePanel: document.querySelector("#dismantlePanel"),
    toastStack: document.querySelector("#toastStack")
  };

  // ---------- 轻提示 ----------
  function toast(message, type = "info") {
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    els.toastStack.appendChild(item);
    window.setTimeout(() => {
      item.classList.add("leaving");
      item.addEventListener("transitionend", () => item.remove(), { once: true });
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- 设置区 ----------
  function renderSettings(frozen) {
    els.paperSize.value = state.settings.paperSize;
    els.flowMode.value = state.settings.flowMode;
    els.gridGap.value = state.settings.gridGap;
    els.workTitle.value = state.settings.workTitle;
    // 拆版单未结束：纸张改动会牵动版面，一并冻结
    els.paperSize.disabled = frozen;
    els.clearBoardBtn.disabled = frozen;
    els.stage.classList.toggle("frozen", frozen);
  }

  function renderStyleFilter() {
    const current = els.styleFilter.value || "all";
    const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );
    els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
      .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
      .join("")}`;
    els.styleFilter.value = styles.includes(current) ? current : "all";
  }

  function renderInventory(frozen) {
    const keyword = els.inventorySearch.value.trim();
    const style = els.styleFilter.value;
    const usage = Store.getUsage();
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
        // 拆版单未结束时字模不得移除：隐藏删除入口、禁止拖拽
        const deleteButton = frozen
          ? ""
          : `<button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>`;
        return `
          <article class="type-card ${selected}" ${frozen ? "" : `draggable="true"`} data-type-id="${item.id}">
            <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
            <div class="type-meta">
              <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
              <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
            </div>
            ${deleteButton}
          </article>
        `;
      })
      .join("");
  }

  // ---------- 版面 ----------
  function renderStage(frozen, order) {
    const { cols, rows } = Store.getGrid();
    const map = new Map(state.placements.map((item) => [Store.placementKey(item.row, item.col), item]));
    const cellStatus = new Map();
    if (frozen && order) {
      order.cells.forEach((cell) => cellStatus.set(cell.key, cell.result));
    }
    els.stage.className = `stage ${state.settings.paperSize}${frozen ? " frozen" : ""}`;
    els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
    els.stage.style.gap = `${state.settings.gridGap}px`;
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const key = Store.placementKey(row, col);
        const placement = map.get(key);
        const type = placement ? Store.getType(placement.typeId) : null;
        const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
        let stateClass = "";
        let mark = "";
        if (frozen && placement) {
          const result = cellStatus.get(key) || Dismantle.STATUS.PENDING;
          if (result === Dismantle.STATUS.PENDING) stateClass = "return-pending";
          else if (result === Dismantle.STATUS.LOST) {
            stateClass = "return-lost";
            mark = `<span class="cell-mark">遗</span>`;
          } else {
            stateClass = result === Dismantle.STATUS.WORN ? "return-worn" : "return-good";
            mark = `<span class="cell-mark">归</span>`;
          }
        } else if (type) {
          stateClass = "used";
        }
        cells.push(`
          <button class="cell ${stateClass} ${vertical}" data-row="${row}" data-col="${col}" type="button"
            aria-label="第${row + 1}行第${col + 1}列" ${frozen ? "disabled" : ""}>
            ${type ? escapeHtml(type.char) : ""}
            ${mark}
          </button>
        `);
      }
    }
    els.stage.innerHTML = cells.join("");
  }

  function renderUsage() {
    const usage = Store.getUsage();
    const entries = state.inventory.filter((item) => usage[item.id]);
    els.placedCount.textContent = `${state.placements.length}个落字`;

    const shortages = Store.getShortages();
    els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
    els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

    const selectedType = Store.getSelectedType();
    els.selectedTypeLabel.textContent = selectedType
      ? `当前：${selectedType.char} · ${selectedType.style}`
      : "未选择字模";

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

  // ---------- 拆版归库台 ----------
  function renderFreezeBanner(frozen, order) {
    if (frozen && order) {
      const { done, total } = Dismantle.orderProgress(order);
      els.freezeBanner.hidden = false;
      els.freezeBanner.textContent = `拆版中：《${order.title}》版面已冻结，${done}/${total} 格已登记。落字格全部归还后自动解冻。`;
    } else {
      els.freezeBanner.hidden = true;
      els.freezeBanner.textContent = "";
    }
  }

  function cellRowHtml(cell) {
    const position = `第${cell.row + 1}行第${cell.col + 1}列`;
    const head = `
      <div class="return-cell-head">
        <span class="return-glyph">${escapeHtml(cell.char)}</span>
        <div class="return-cell-meta">
          <strong>${position}</strong>
          <span>${escapeHtml(cell.style)} · 拆版时${escapeHtml(cell.wear)}</span>
        </div>
      </div>`;

    if (cell.result === Dismantle.STATUS.PENDING) {
      return `
        <li class="return-cell pending" data-cell-key="${cell.key}">
          ${head}
          <div class="return-actions">
            <button type="button" data-register-key="${cell.key}" data-result="good">完好归库</button>
            <button type="button" data-register-key="${cell.key}" data-result="worn">磨损归库</button>
            <button type="button" data-toggle-lost="${cell.key}">遗失登记</button>
          </div>
          <form class="lost-form" data-lost-form="${cell.key}" hidden>
            <input type="text" maxlength="20" placeholder="责任人（必填）" data-lost-responsible="${cell.key}" />
            <input type="text" maxlength="60" placeholder="遗失说明（必填）" data-lost-note="${cell.key}" />
            <button type="button" class="danger" data-lost-confirm="${cell.key}">确认遗失</button>
            <button type="button" data-lost-cancel="${cell.key}">取消</button>
          </form>
        </li>`;
    }

    const label = Dismantle.STATUS_LABEL[cell.result];
    const detail =
      cell.result === Dismantle.STATUS.LOST
        ? `<span class="lost-detail">责任人：${escapeHtml(cell.responsible)} · ${escapeHtml(cell.note)}</span>`
        : "";
    return `
      <li class="return-cell done result-${cell.result}">
        ${head}
        <div class="return-done">
          <span class="result-tag ${cell.result}">${label}</span>
          ${detail}
        </div>
      </li>`;
  }

  function orderCardHtml(order) {
    const { done, total } = Dismantle.orderProgress(order);
    const pendingByType = new Map();
    order.cells.forEach((cell) => {
      if (cell.result === Dismantle.STATUS.PENDING) {
        const current = pendingByType.get(cell.typeId) || { char: cell.char, style: cell.style, count: 0 };
        current.count += 1;
        pendingByType.set(cell.typeId, current);
      }
    });
    const bulkOptions = [...pendingByType.entries()]
      .map(
        ([typeId, info]) =>
          `<option value="${typeId}">${escapeHtml(info.char)} · ${escapeHtml(info.style)}（待还${info.count}）</option>`
      )
      .join("");
    const bulkBar =
      bulkOptions.length > 0
        ? `
          <div class="bulk-bar">
            <select id="bulkType">${bulkOptions}</select>
            <select id="bulkResult">
              <option value="good">完好</option>
              <option value="worn">磨损</option>
            </select>
            <button type="button" id="bulkSubmit" class="primary">批量归库</button>
          </div>`
        : `<p class="empty">所有格子均已登记。</p>`;

    return `
      <article class="order-card active">
        <header class="order-head">
          <div>
            <strong>《${escapeHtml(order.title)}》</strong>
            <span>建单于 ${new Date(order.createdAt).toLocaleString("zh-CN")}</span>
          </div>
          <span class="order-progress">${done}/${total}</span>
        </header>
        <div class="progress-track"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
        ${bulkBar}
        <ul class="return-cells">${order.cells.map(cellRowHtml).join("")}</ul>
      </article>`;
  }

  function finishedOrderHtml(order) {
    const counts = { good: 0, worn: 0, lost: 0 };
    order.cells.forEach((cell) => {
      if (counts[cell.result] !== undefined) counts[cell.result] += 1;
    });
    const lostRows = order.cells
      .filter((cell) => cell.result === Dismantle.STATUS.LOST)
      .map(
        (cell) =>
          `<li>「${escapeHtml(cell.char)}」${cell.row + 1}-${cell.col + 1} · 责任人 ${escapeHtml(
            cell.responsible
          )}：${escapeHtml(cell.note)}</li>`
      )
      .join("");
    return `
      <article class="order-card finished">
        <header class="order-head">
          <div>
            <strong>《${escapeHtml(order.title)}》</strong>
            <span>${new Date(order.finishedAt || order.createdAt).toLocaleString("zh-CN")} 已结束解冻</span>
          </div>
          <span class="result-summary">完好${counts.good} · 磨损${counts.worn} · 遗失${counts.lost}</span>
        </header>
        ${lostRows ? `<ul class="lost-list">${lostRows}</ul>` : ""}
      </article>`;
  }

  function renderDismantle() {
    const order = Dismantle.getActiveOrder();
    if (order) {
      const finished = state.dismantleOrders
        .filter((item) => item.status === "finished")
        .slice(0, 20)
        .map(finishedOrderHtml)
        .join("");
      els.dismantlePanel.innerHTML = `
        ${orderCardHtml(order)}
        <h3 class="panel-subtitle">已结束的拆版单</h3>
        <div class="order-history">${finished || `<p class="empty">还没有已结束的拆版单。</p>`}</div>`;
      return;
    }

    const title = state.settings.workTitle.trim();
    const shortages = Store.getShortages();
    const reasons = [];
    if (!title) reasons.push("作品名为空");
    if (state.placements.length === 0) reasons.push("版面没有落字");
    if (shortages.length > 0) reasons.push(`${shortages.length}种字模超用`);
    const blocked = reasons.length > 0;

    els.dismantlePanel.innerHTML = `
      <article class="order-card create-card">
        <div class="order-head">
          <div>
            <strong>建立拆版单</strong>
            <span>建单后立即冻结版面，逐格登记完好 / 磨损 / 遗失；遗失须填责任人与说明。</span>
          </div>
        </div>
        <p class="create-hint ${blocked ? "blocked" : ""}">
          ${blocked ? `暂不可建单：${reasons.join("、")}。` : "条件满足：作品名非空且字模未超用，可以建单。"}
        </p>
        <button type="button" id="createOrderBtn" class="primary" ${blocked ? "disabled" : ""}>
          拆版建单并冻结版面
        </button>
      </article>
      <h3 class="panel-subtitle">已结束的拆版单</h3>
      <div class="order-history">
        ${
          state.dismantleOrders
            .filter((item) => item.status === "finished")
            .slice(0, 20)
            .map(finishedOrderHtml)
            .join("") || `<p class="empty">还没有已结束的拆版单。</p>`
        }
      </div>`;
  }

  function renderAll() {
    Store.save();
    const order = Dismantle.getActiveOrder();
    const frozen = Boolean(order);
    renderSettings(frozen);
    renderStyleFilter();
    renderInventory(frozen);
    renderStage(frozen, order);
    renderUsage();
    renderDrafts();
    renderFreezeBanner(frozen, order);
    renderDismantle();
  }

  // ---------- 排版操作 ----------
  function placeType(row, col, typeId = state.selectedTypeId) {
    if (Dismantle.isBoardFrozen()) {
      toast("拆版单未结束，版面冻结中，不能落字或改动。", "warn");
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
    const item = Store.addType({
      char: els.charInput.value,
      style: els.styleInput.value,
      size: els.sizeInput.value,
      quantity: els.quantityInput.value,
      wear: els.wearInput.value
    });
    if (!item) return;
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
    toast("草稿已保存。", "ok");
  }

  // 载入草稿：冻结冲突 / 字模缺失冲突时保留当前版面并提示
  function loadDraft(draftId) {
    if (Dismantle.isBoardFrozen()) {
      toast("拆版单未结束，版面冻结中，无法载入草稿，已保留当前版面。", "warn");
      return false;
    }
    const draft = state.drafts.find((item) => item.id === draftId);
    if (!draft) return false;
    const missing = draft.placements.filter((placement) => !Store.getType(placement.typeId));
    if (missing.length > 0) {
      toast(`草稿中有 ${missing.length} 处引用的字模已不在字模库，载入冲突，已保留当前版面。`, "warn");
      return false;
    }
    state.settings = structuredClone(draft.settings);
    Store.setPlacements(structuredClone(draft.placements));
    renderAll();
    toast(`已载入草稿《${draft.title}》。`, "ok");
    return true;
  }

  function exportPreview() {
    const { cols, rows } = Store.getGrid();
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
    state.placements.forEach((placement) => {
      const type = Store.getType(placement.typeId);
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

  // ---------- 设置区事件 ----------
  els.paperSize.addEventListener("change", () => {
    if (Dismantle.isBoardFrozen()) {
      toast("拆版单未结束，纸张与版面冻结中，不能更改。", "warn");
      renderSettings(true);
      return;
    }
    state.settings.paperSize = els.paperSize.value;
    const { cols, rows } = Store.getGrid();
    Store.setPlacements(state.placements.filter((item) => item.row < rows && item.col < cols));
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
    Store.save();
  });

  els.typeForm.addEventListener("submit", addType);
  els.inventorySearch.addEventListener("input", () => renderInventory(Dismantle.isBoardFrozen()));
  els.styleFilter.addEventListener("change", () => renderInventory(Dismantle.isBoardFrozen()));
  els.saveDraftBtn.addEventListener("click", saveDraft);
  els.exportBtn.addEventListener("click", exportPreview);
  els.clearBoardBtn.addEventListener("click", () => {
    if (Dismantle.isBoardFrozen()) {
      toast("拆版单未结束，不能清空版面。", "warn");
      return;
    }
    Store.setPlacements([]);
    renderAll();
  });

  // ---------- 字模库事件 ----------
  els.typeList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-type]");
    if (deleteButton) {
      if (Dismantle.isBoardFrozen()) {
        toast("拆版单未结束，字模不得减少或移除。", "warn");
        return;
      }
      const typeId = deleteButton.dataset.deleteType;
      Store.removeType(typeId);
      renderAll();
      return;
    }
    const card = event.target.closest("[data-type-id]");
    if (!card) return;
    state.selectedTypeId = card.dataset.typeId;
    renderAll();
  });

  els.typeList.addEventListener("dragstart", (event) => {
    if (Dismantle.isBoardFrozen()) {
      event.preventDefault();
      return;
    }
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
    placeType(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  // ---------- 草稿事件 ----------
  els.draftList.addEventListener("click", (event) => {
    const loadButton = event.target.closest("[data-load-draft]");
    const deleteButton = event.target.closest("[data-delete-draft]");
    if (loadButton) {
      loadDraft(loadButton.dataset.loadDraft);
    }
    if (deleteButton) {
      state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
      renderAll();
    }
  });

  // ---------- 拆版归库台事件 ----------
  els.dismantlePanel.addEventListener("click", (event) => {
    const createBtn = event.target.closest("#createOrderBtn");
    if (createBtn && !createBtn.disabled) {
      const result = Dismantle.createOrder();
      if (!result.ok) {
        toast(result.error, "warn");
      } else {
        renderAll();
        toast(`拆版单《${result.order.title}》已建立，版面冻结，开始逐格归还。`, "ok");
      }
      return;
    }

    const bulkBtn = event.target.closest("#bulkSubmit");
    if (bulkBtn) {
      const typeId = document.querySelector("#bulkType")?.value;
      const resultValue = document.querySelector("#bulkResult")?.value;
      if (!typeId) return;
      const result = Dismantle.bulkReturn(typeId, resultValue);
      if (!result.ok) {
        toast(result.error, "warn");
      } else {
        renderAll();
        toast(
          result.finished
            ? `已批量归库 ${result.count} 格，全部格子完成，拆版单结束并解冻。`
            : `已批量归库 ${result.count} 格。`,
          "ok"
        );
      }
      return;
    }

    const registerBtn = event.target.closest("[data-register-key]");
    if (registerBtn) {
      const result = Dismantle.registerCell(registerBtn.dataset.registerKey, {
        result: registerBtn.dataset.result
      });
      if (!result.ok) {
        toast(result.error, "warn");
      } else {
        renderAll();
        toast(result.finished ? "该格已归库，全部格子完成，拆版单结束并解冻。" : "该格已归库。", "ok");
      }
      return;
    }

    const toggleLostBtn = event.target.closest("[data-toggle-lost]");
    if (toggleLostBtn) {
      const form = els.dismantlePanel.querySelector(
        `[data-lost-form="${toggleLostBtn.dataset.toggleLost}"]`
      );
      if (form) form.hidden = !form.hidden;
      return;
    }

    const cancelLostBtn = event.target.closest("[data-lost-cancel]");
    if (cancelLostBtn) {
      const form = els.dismantlePanel.querySelector(
        `[data-lost-form="${cancelLostBtn.dataset.lostCancel}"]`
      );
      if (form) form.hidden = true;
      return;
    }

    const confirmLostBtn = event.target.closest("[data-lost-confirm]");
    if (confirmLostBtn) {
      const key = confirmLostBtn.dataset.lostConfirm;
      const responsible = els.dismantlePanel.querySelector(`[data-lost-responsible="${key}"]`)?.value || "";
      const note = els.dismantlePanel.querySelector(`[data-lost-note="${key}"]`)?.value || "";
      const result = Dismantle.registerCell(key, {
        result: Dismantle.STATUS.LOST,
        responsible,
        note
      });
      if (!result.ok) {
        toast(result.error, "warn");
      } else {
        renderAll();
        toast(result.finished ? "遗失已登记，全部格子完成，拆版单结束并解冻。" : "遗失已登记，该字模不入库。", "ok");
      }
    }
  });

  renderAll();
})();
