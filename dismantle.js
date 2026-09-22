// 拆版规则：建单校验、逐格登记校验、完单判定。
// 纯业务规则，不触碰 DOM，也不直接修改库存。
(function () {
  const CONDITIONS = {
    intact: { label: "完好", restock: true },
    worn: { label: "磨损", restock: true },
    lost: { label: "遗失", restock: false }
  };

  function isOpen(state) {
    return Boolean(state.dismantle && state.dismantle.order && state.dismantle.order.status === "open");
  }

  // 建单条件：作品名非空、版面有落字、字模不超用，且没有进行中的拆版单
  function canCreate(state, shortages) {
    if (isOpen(state)) return { ok: false, reason: "已有未结束的拆版单，请先完成" };
    if (!state.settings.workTitle.trim()) return { ok: false, reason: "作品名不能为空，无法建单" };
    if (state.placements.length === 0) return { ok: false, reason: "版面还没有落字，无需拆版" };
    if (shortages.length > 0) {
      const names = shortages.map((item) => item.char).join("、");
      return { ok: false, reason: `字模「${names}」超用，请先调整版面或补足库存` };
    }
    return { ok: true };
  }

  // 以当前版面快照建单：每个落字格都是待归还
  function buildOrder(state) {
    return {
      id: crypto.randomUUID(),
      title: state.settings.workTitle.trim(),
      createdAt: new Date().toISOString(),
      status: "open",
      cells: state.placements.map((placement) => {
        const type = state.inventory.find((item) => item.id === placement.typeId);
        return {
          row: placement.row,
          col: placement.col,
          typeId: placement.typeId,
          char: type ? type.char : "？",
          status: "pending",
          responsible: "",
          note: "",
          registeredAt: null
        };
      })
    };
  }

  function findCell(order, row, col) {
    return order.cells.find((cell) => cell.row === row && cell.col === col) || null;
  }

  function progress(order) {
    const total = order.cells.length;
    const done = order.cells.filter((cell) => cell.status !== "pending").length;
    return { done, total };
  }

  // 登记校验：重复登记或超量归还，整单拒绝；遗失必须填责任人与说明
  function validateRegistration(order, row, col, condition, meta) {
    if (!order || order.status !== "open") return { ok: false, reason: "拆版单已结束，拒绝登记" };
    const { done, total } = progress(order);
    if (done >= total) return { ok: false, reason: "归还数量已达上限，超量归还整单拒绝" };
    const cell = findCell(order, row, col);
    if (!cell) return { ok: false, reason: "该格没有待归还字模" };
    if (cell.status !== "pending") return { ok: false, reason: "该格已登记，重复登记整单拒绝" };
    if (!CONDITIONS[condition]) return { ok: false, reason: "请选择归还状态：完好、磨损或遗失" };
    if (condition === "lost") {
      if (!meta.responsible.trim()) return { ok: false, reason: "遗失须填写责任人" };
      if (!meta.note.trim()) return { ok: false, reason: "遗失须填写说明" };
    }
    return { ok: true };
  }

  function applyRegistration(order, row, col, condition, meta) {
    const cell = findCell(order, row, col);
    cell.status = condition;
    cell.responsible = condition === "lost" ? meta.responsible.trim() : "";
    cell.note = condition === "lost" ? meta.note.trim() : "";
    cell.registeredAt = new Date().toISOString();
    return cell;
  }

  function isComplete(order) {
    return order.cells.length > 0 && order.cells.every((cell) => cell.status !== "pending");
  }

  // 遗失核减汇总：完单时统一从库存扣除
  function lostCounts(order) {
    return order.cells.reduce((acc, cell) => {
      if (cell.status === "lost") acc[cell.typeId] = (acc[cell.typeId] || 0) + 1;
      return acc;
    }, {});
  }

  function summarize(order) {
    return order.cells.reduce(
      (acc, cell) => {
        if (cell.status === "pending") acc.pending += 1;
        else acc[cell.status] += 1;
        return acc;
      },
      { pending: 0, intact: 0, worn: 0, lost: 0 }
    );
  }

  window.DismantleRules = {
    CONDITIONS,
    isOpen,
    canCreate,
    buildOrder,
    findCell,
    progress,
    validateRegistration,
    applyRegistration,
    isComplete,
    lostCounts,
    summarize
  };
})();
