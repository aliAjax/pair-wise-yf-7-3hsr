// 库存状态：用量统计、超用检查、归还入账与遗失核销，以及冻结期间的字模守卫。
(function () {
  function usage(state) {
    return state.placements.reduce((acc, placement) => {
      acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
      return acc;
    }, {});
  }

  function shortages(state) {
    const used = usage(state);
    return state.inventory.filter((item) => (used[item.id] || 0) > item.quantity);
  }

  function isFrozen(state) {
    return window.DismantleRules.isOpen(state);
  }

  // 拆版单未结束时，字模不得减少或移除
  function guardTypeChange(state) {
    if (isFrozen(state)) return { ok: false, reason: "拆版单未结束，字模不得减少或移除" };
    return { ok: true };
  }

  // 逐格归还入账：移除对应落字，该字模的占用释放、可用库存随之增加；
  // 遗失格只销账不增库存，其核减在完单时统一结算
  function applyReturn(state, cell) {
    const index = state.placements.findIndex((item) => item.row === cell.row && item.col === cell.col);
    if (index >= 0) state.placements.splice(index, 1);
  }

  // 完单结算：按遗失数量核减字模库存，并清掉单据覆盖的落字
  function settleOrder(state, order) {
    const losses = window.DismantleRules.lostCounts(order);
    Object.entries(losses).forEach(([typeId, count]) => {
      const type = state.inventory.find((item) => item.id === typeId);
      if (type) type.quantity = Math.max(0, type.quantity - count);
    });
    state.placements = state.placements.filter(
      (placement) => !order.cells.some((cell) => cell.row === placement.row && cell.col === placement.col)
    );
  }

  window.InventoryStock = { usage, shortages, isFrozen, guardTypeChange, applyReturn, settleOrder };
})();
