// Renders the right-hand outline/TOC tree from heading list and tracks which
// section is "current" as the user scrolls or moves the cursor.

export function renderOutline(host, headings, { onJump, currentIndex = -1 } = {}) {
  host.innerHTML = "";
  if (!headings.length) {
    host.innerHTML = '<p class="empty-hint">Headings appear here as you write.</p>';
    return;
  }
  headings.forEach((h, i) => {
    const el = document.createElement("div");
    el.className = `outline-item lvl-${h.depth}` + (i === currentIndex ? " current" : "");
    el.textContent = h.text || "(untitled)";
    el.title = h.text;
    el.addEventListener("click", () => onJump?.(h, i));
    host.appendChild(el);
  });
}

export function currentHeadingIndex(headings, line) {
  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= line) idx = i;
    else break;
  }
  return idx;
}
