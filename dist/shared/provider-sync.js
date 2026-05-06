function mergeModels(newModels, oldModels) {
  const oldModelMap = new Map(oldModels.map((m) => [m.id, m]));
  return newModels.map((m) => {
    const old = oldModelMap.get(m.id);
    if (old) {
      const merged = { ...m };
      for (const [k, v] of Object.entries(old)) {
        if (!(k in m)) merged[k] = v;
      }
      return merged;
    }
    return m;
  });
}
export {
  mergeModels
};
