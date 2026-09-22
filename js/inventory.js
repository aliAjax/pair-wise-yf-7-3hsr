// 库存状态：字模库、版面落字、草稿的状态维护与本地持久化
(function () {
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
    dismantleOrders: [],
    settings: {
      paperSize: "postcard",
      flowMode: "horizontal",
      gridGap: 8,
      workTitle: "晚风小笺"
    }
  };

  function loadState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return structuredClone(defaultState);
    try {
      const parsed = JSON.parse(saved);
      const merged = {
        ...structuredClone(defaultState),
        ...parsed,
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        dismantleOrders: Array.isArray(parsed.dismantleOrders) ? parsed.dismantleOrders : []
      };
      if (!Array.isArray(merged.inventory)) merged.inventory = [];
      if (!Array.isArray(merged.placements)) merged.placements = [];
      if (!Array.isArray(merged.drafts)) merged.drafts = [];
      return merged;
    } catch {
      return structuredClone(defaultState);
    }
  }

  const state = loadState();

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
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

  function getType(id) {
    return state.inventory.find((item) => item.id === id) || null;
  }

  function getSelectedType() {
    return getType(state.selectedTypeId);
  }

  // 各字模在当前版面上的落字数量
  function getUsage(source = state.placements) {
    return source.reduce((acc, placement) => {
      acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
      return acc;
    }, {});
  }

  // 超过库存数量的字模列表
  function getShortages() {
    const usage = getUsage();
    return state.inventory.filter((item) => (usage[item.id] || 0) > item.quantity);
  }

  function addType(data) {
    const item = {
      id: crypto.randomUUID(),
      char: data.char.trim(),
      style: data.style.trim(),
      size: Number(data.size),
      quantity: Number(data.quantity),
      wear: data.wear
    };
    if (!item.char || !item.style) return null;
    state.inventory.unshift(item);
    state.selectedTypeId = item.id;
    save();
    return item;
  }

  function removeType(id) {
    state.inventory = state.inventory.filter((item) => item.id !== id);
    state.placements = state.placements.filter((item) => item.typeId !== id);
    if (state.selectedTypeId === id) state.selectedTypeId = state.inventory[0]?.id || null;
    save();
  }

  // 拆版归库：完好 / 磨损字模入库，库存只增不减
  function increaseStock(id, amount = 1) {
    const item = getType(id);
    if (!item) return false;
    item.quantity += amount;
    return true;
  }

  function setPlacements(placements) {
    state.placements = placements;
    save();
  }

  window.Store = {
    state,
    save,
    getGrid,
    placementKey,
    getType,
    getSelectedType,
    getUsage,
    getShortages,
    addType,
    removeType,
    increaseStock,
    setPlacements
  };
})();
