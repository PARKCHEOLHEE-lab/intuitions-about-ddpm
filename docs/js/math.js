// Render the LaTeX in the page with vendored KaTeX (auto-render extension).
// Equations are written inline with $...$ (inline) and $$...$$ (display).
window.addEventListener("DOMContentLoaded", () => {
  if (typeof renderMathInElement !== "function") return;
  renderMathInElement(document.body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
});
