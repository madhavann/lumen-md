const MD_EXT = /\.(md|markdown)$/i;

function iconFor(node) {
  if (node.kind === "dir") return "📁";
  if (MD_EXT.test(node.name)) return "📄";
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(node.name)) return "🖼️";
  return "📃";
}

export function renderTree(container, nodes, opts) {
  const { activePath, expanded, dirtyPaths, onOpenFile, onToggleDir, onContext } = opts;
  container.innerHTML = "";
  if (!nodes.length) {
    container.innerHTML = '<p class="empty-hint">This folder is empty. Right-click to create a file.</p>';
    return;
  }
  const frag = buildLevel(nodes, 0);
  container.appendChild(frag);

  function buildLevel(list, depth) {
    const wrap = document.createElement("div");
    for (const node of list) {
      const row = document.createElement("div");
      row.className = "tree-node";

      const rowEl = document.createElement("div");
      rowEl.className = "tree-row" + (node.path === activePath ? " active" : "");
      rowEl.style.paddingLeft = `${6 + depth * 14}px`;
      rowEl.dataset.path = node.path;

      const twirl = document.createElement("span");
      twirl.className = "twirl";
      twirl.textContent = node.kind === "dir" ? (expanded.has(node.path) ? "▾" : "▸") : "";
      rowEl.appendChild(twirl);

      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = iconFor(node);
      rowEl.appendChild(icon);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = node.name;
      rowEl.appendChild(name);

      if (node.kind !== "dir") {
        const dot = document.createElement("span");
        dot.className = "dirty-mark";
        dot.textContent = "●";
        dot.style.display = dirtyPaths?.has(node.path) ? "" : "none";
        rowEl.appendChild(dot);
      }

      rowEl.addEventListener("click", () => {
        if (node.kind === "dir") onToggleDir(node.path);
        else onOpenFile(node.path);
      });
      rowEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onContext(node, e.clientX, e.clientY);
      });

      row.appendChild(rowEl);

      if (node.kind === "dir" && expanded.has(node.path) && node.children) {
        const childWrap = document.createElement("div");
        childWrap.className = "tree-children";
        childWrap.style.display = "contents";
        row.appendChild(buildLevel(node.children, depth + 1));
      }
      wrap.appendChild(row);
    }
    return wrap;
  }
}
