// 拆版规则：建单校验、版面冻结、逐格登记、整单拒绝与归库
(function () {
  const { state } = window.Store;

  const STATUS = {
    PENDING: "pending",
    GOOD: "good", // 完好
    WORN: "worn", // 磨损
    LOST: "lost" // 遗失
  };

  const STATUS_LABEL = {
    good: "完好",
    worn: "磨损",
    lost: "遗失"
  };

  function getActiveOrder() {
    return state.dismantleOrders.find((order) => order.status === "active") || null;
  }

  function isBoardFrozen() {
    return Boolean(getActiveOrder());
  }

  function sortCells(cells) {
    return [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  }

  // 建单：作品名非空、有落字、字模不超用；建单后冻结版面，每个落字格待归还
  function createOrder() {
    const active = getActiveOrder();
    if (active) return { ok: false, error: "已有未结束的拆版单，请先完成全部格子登记。" };

    const title = state.settings.workTitle.trim();
    if (!title) return { ok: false, error: "作品名不能为空，请先填写作品名再建拆版单。" };
    if (state.placements.length === 0) return { ok: false, error: "版面没有落字，无法建立拆版单。" };

    const usage = Store.getUsage();
    const overused = state.inventory.filter((item) => (usage[item.id] || 0) > item.quantity);
    if (overused.length > 0) {
      return {
        ok: false,
        error: `字模超用，无法建单：${overused
          .map((item) => `${item.char}（${usage[item.id]}/${item.quantity}）`)
          .join("、")}。`
      };
    }

    const now = new Date().toISOString();
    const order = {
      id: crypto.randomUUID(),
      title,
      status: "active",
      settings: structuredClone(state.settings),
      cells: sortCells(
        state.placements.map((placement) => {
          const type = Store.getType(placement.typeId);
          return {
            key: Store.placementKey(placement.row, placement.col),
            row: placement.row,
            col: placement.col,
            typeId: placement.typeId,
            char: type ? type.char : "？",
            style: type ? type.style : "未知风格",
            wear: type ? type.wear : "未知",
            result: STATUS.PENDING
          };
        })
      ),
      createdAt: now,
      finishedAt: null
    };
    state.dismantleOrders.unshift(order);
    Store.save();
    return { ok: true, order };
  }

  // 整单结束检查：全部格子完成（无待归还）后结束并解冻
  function completeIfDone(order) {
    if (order.status !== "active") return false;
    if (order.cells.some((cell) => cell.result === STATUS.PENDING)) return false;

    order.status = "finished";
    order.finishedAt = new Date().toISOString();
    // 整单结束：清空版面并解冻；库存增量已在逐格/批量归还时写入
    Store.setPlacements([]);
    Store.save();
    return true;
  }

  // 逐格（或批量）登记前置校验：重复登记、超量归还、遗失责任信息，任一不满足整单拒绝
  function validateRegistration(order, entries) {
    if (!order || order.status !== "active") return "拆版单不在进行中。";

    const pendingKeys = new Set(
      order.cells.filter((cell) => cell.result === STATUS.PENDING).map((cell) => cell.key)
    );
    const seen = new Set();

    for (const entry of entries) {
      const cell = order.cells.find((item) => item.key === entry.key);
      if (!cell) return `第${(entry.row || 0) + 1}行第${(entry.col || 0) + 1}列不属于本拆版单。`;

      // 重复登记：格子已登记，或本批重复提交同一格子 —— 整单拒绝
      if (!pendingKeys.has(cell.key)) return `第${cell.row + 1}行第${cell.col + 1}列已登记，不能重复归还。`;
      if (seen.has(cell.key)) return `第${cell.row + 1}行第${cell.col + 1}列在本次提交中重复登记。`;
      seen.add(cell.key);

      if (![STATUS.GOOD, STATUS.WORN, STATUS.LOST].includes(entry.result)) {
        return `第${cell.row + 1}行第${cell.col + 1}列请选择完好、磨损或遗失。`;
      }

      if (entry.result === STATUS.LOST) {
        if (!String(entry.responsible || "").trim()) {
          return `第${cell.row + 1}行第${cell.col + 1}列字模遗失，必须填写责任人。`;
        }
        if (!String(entry.note || "").trim()) {
          return `第${cell.row + 1}行第${cell.col + 1}列字模遗失，必须填写说明。`;
        }
      }
    }

    // 超量归还：同一字模本次归还数 + 已归还数不得超过拆版时该字模落字数
    const totals = {};
    order.cells.forEach((cell) => {
      if (cell.result !== STATUS.PENDING && cell.result !== STATUS.LOST) {
        totals[cell.typeId] = (totals[cell.typeId] || 0) + 1;
      }
    });
    for (const entry of entries) {
      if (entry.result === STATUS.LOST) continue;
      const cell = order.cells.find((item) => item.key === entry.key);
      totals[cell.typeId] = (totals[cell.typeId] || 0) + 1;
    }
    for (const entry of entries) {
      if (entry.result === STATUS.LOST) continue;
      const cell = order.cells.find((item) => item.key === entry.key);
      const cap = order.cells.filter((item) => item.typeId === cell.typeId).length;
      if (totals[cell.typeId] > cap) {
        return `「${cell.char}」归还数量超过拆版落字数（${cap}枚），整单拒绝。`;
      }
    }

    return null;
  }

  // 通过校验后一次性落账：完好/磨损增加对应库存，遗失不入库
  function applyRegistration(order, entries) {
    for (const entry of entries) {
      const cell = order.cells.find((item) => item.key === entry.key);
      cell.result = entry.result;
      if (entry.result === STATUS.LOST) {
        cell.responsible = String(entry.responsible).trim();
        cell.note = String(entry.note).trim();
      } else {
        Store.increaseStock(cell.typeId, 1);
      }
    }
    const finished = completeIfDone(order);
    Store.save();
    return { finished };
  }

  // 单格登记
  function registerCell(key, payload) {
    const order = getActiveOrder();
    if (!order) return { ok: false, error: "当前没有进行中的拆版单。" };
    const cell = order.cells.find((item) => item.key === key);
    if (!cell) return { ok: false, error: "该格子不在拆版单中。" };

    const entries = [{ key, result: payload.result, responsible: payload.responsible, note: payload.note }];
    const error = validateRegistration(order, entries);
    if (error) return { ok: false, error };

    const { finished } = applyRegistration(order, entries);
    return { ok: true, finished };
  }

  // 批量归还（一次登记多格）：任一不合法整单拒绝，全部数据不变
  function bulkReturn(typeId, result) {
    const order = getActiveOrder();
    if (!order) return { ok: false, error: "当前没有进行中的拆版单。" };
    if (result !== STATUS.GOOD && result !== STATUS.WORN) {
      return { ok: false, error: "批量归还只能登记为完好或磨损，遗失请逐格登记。" };
    }
    const entries = order.cells
      .filter((cell) => cell.typeId === typeId && cell.result === STATUS.PENDING)
      .map((cell) => ({ key: cell.key, result }));
    if (entries.length === 0) return { ok: false, error: "该字模没有待归还的格子。" };

    const error = validateRegistration(order, entries);
    if (error) return { ok: false, error };

    const { finished } = applyRegistration(order, entries);
    return { ok: true, finished, count: entries.length };
  }

  function orderProgress(order) {
    const done = order.cells.filter((cell) => cell.result !== STATUS.PENDING).length;
    return { done, total: order.cells.length };
  }

  window.Dismantle = {
    STATUS,
    STATUS_LABEL,
    getActiveOrder,
    isBoardFrozen,
    createOrder,
    registerCell,
    bulkReturn,
    orderProgress
  };
})();
