// Apply saved appearance before React paints. Dark stays the default.
(() => {
  let theme = "dark";
  try {
    if (localStorage.getItem("coding12pm:theme:v1") === "light")
      theme = "light";
  } catch {}
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f1f6fa" : "#090f1e");
})();
