import { fuzzyScore } from "./utils.js";

export function createCommandPalette({ overlay, input, resultsEl, getItems }) {
  let selected = 0;
  let current = [];

  function open() {
    overlay.hidden = false;
    input.value = "";
    renderResults();
    setTimeout(() => input.focus(), 0);
  }
  function close() {
    overlay.hidden = true;
  }
  function renderResults() {
    const query = input.value.trim();
    const items = getItems();
    current = items
      .map((item) => ({ item, score: fuzzyScore(query, item.label + " " + (item.hint || "")) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((x) => x.item);
    selected = 0;
    resultsEl.innerHTML = "";
    if (!current.length) {
      resultsEl.innerHTML = '<li class="empty-hint" style="cursor:default">No matches</li>';
      return;
    }
    current.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = i === selected ? "selected" : "";
      li.innerHTML = `<span>${item.label}</span><span class="tag">${item.hint || item.kind || ""}</span>`;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
      resultsEl.appendChild(li);
    });
  }
  function choose(i) {
    const item = current[i];
    if (!item) return;
    close();
    item.run?.();
  }
  function move(delta) {
    if (!current.length) return;
    selected = (selected + delta + current.length) % current.length;
    [...resultsEl.children].forEach((li, i) => li.classList.toggle("selected", i === selected));
    resultsEl.children[selected]?.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(selected); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  return { open, close };
}
