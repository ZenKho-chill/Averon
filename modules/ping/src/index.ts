// Entry point cho module ping

export const onLoad = () => {
  // Hook khi module được load — khởi tạo state ở đây nếu cần.
  // KHÔNG dùng console.log: nó bypass logger (§7) và lẫn vào output của operator console.
  // EN: Called when the module is loaded — init state here if needed.
  // Do NOT console.log here: it bypasses the logger (§7) and mixes into the operator console output.
};

export const onUnload = () => {
  // Hook khi module unload/hot-reload — cleanup ở đây (đóng handle, clear interval...).
  // EN: Called on unload/hot-reload — cleanup here (close handles, clear intervals...).
};
