const toNum = (v) => {
  if (v && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return v;
};

module.exports = { toNum };