// The "⋯" menu: everything the minimal chrome hides.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, closeOverlay, layout, keys, updates, window } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function shortcut(action) {
  const k = keys().find((b) => b.section === "global" && b.action === action);
  if (!k) return "";
  return k.keys.split("-").map((p) => ({ ctrl: "Ctrl", shift: "Shift", alt: "Alt" }[p] ?? p.toUpperCase())).join("+");
}

const shown = (id) => { const n = find(layout(), id); return Boolean(n) && !n.hidden; };

function panel(child) {
  const on = shown("panel") && find(layout(), "panel-body")?.active === child;
  return {
    on,
    act: () => {
      if (on) run("layout.hide", { id: "panel" });
      else { run("layout.select", { stack: "panel-body", child }); run("layout.show", { id: "panel" }); }
    },
  };
}

export default class MoreMenu extends View {
  render() {
    const t = theme();
    const files = panel("files"), changes = panel("changes");
    const items = [
      ["search", "Find space", "search", () => run("mod.open", { name: "picker" }), false, shortcut("mod.open:picker")],
      ["files", "Files", "files", files.act, files.on],
      ["changes", "Changes", "git-compare", changes.act, changes.on],
      find(layout(), "notes") && ["notes", "Notes", "file-text", () => run("layout.toggle", { id: "notes" }), shown("notes"), shortcut("layout.toggle:notes")],
      find(layout(), "agent-todos") && ["todos", "Agent todos", "circle-check", () => run("layout.toggle", { id: "agent-todos" }), shown("agent-todos"), shortcut("layout.toggle:agent-todos")],
      "-",
      ["palette", "Commands", "layers", () => run("app.palette"), false, shortcut("app.palette")],
      ["settings", "Settings", "settings", () => run("app.settings"), false, updates().app.ready ? "update ready" : shortcut("app.settings")],
      ["machine", "Add machine", "plus", () => run("mod.open", { name: "machine-add" }), false],
      ...(window()?.buttons ? ["-",
        ["minimize", "Minimize", "minus", () => run("window.minimize"), false],
        ["maximize", window()?.maximized ? "Restore" : "Maximize", "square", () => run("window.maximize"), false],
        ["close", "Close window", "x", () => run("window.close"), false]] : []),
    ].filter(Boolean);
    const row = ([id, label, icon, act, on, hint]) =>
      h_flex().id(`more-${id}`).h(30).px(10).gap(10).items_center().rounded(7).cursor_pointer()
        .text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => { closeOverlay(props().overlay); act(); })
        .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none().text_color(on ? t.accent : t.dim))
        .child(div().flex_1().truncate().child(label))
        .when(Boolean(hint), (el) => el.child(div().text_size(11).text_color(hint === "update ready" ? t.accent : t.dim).child(hint)));
    return v_flex().size_full().p(5).gap(1).text_size(13)
      .children(items.map((it, i) => it === "-" ? div().id(`sep-${i}`).h(1).mx(8).my(4).bg(t.border) : row(it)));
  }
}
