// Spaces with their agents nested underneath (and sub-agents under those): one sidebar list.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, panes, run, theme, shared, setShared, setAgentOrder, openOverlay, layout, updates } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Same avatar colors as the shipped spaces mod, so both stay consistent.
const MARK = { ansi6: "#7cc7d4", ansi3: "#d4a07e", ansi4: "#8ea6d8", ansi5: "#a99acc", ansi2: "#82c8a8", ansi1: "#cc8aa6" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
// Sub-agents without a pane report raw states; they're never "done" on their own.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class SpaceTree extends View {
  init(_props, _cx) {
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
  }

  toggle(id, cx) {
    this.folded.has(id) ? this.folded.delete(id) : this.folded.add(id);
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  // Keeps shared("space.colors") filled, since the spaces mod (which normally does it) isn't shown.
  colors(sp) {
    const old = shared("space.colors") ?? {};
    const ids = new Set(sp.map((s) => s.id));
    const kept = Object.fromEntries(Object.entries(old).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(old).length;
    for (const s of sp) {
      if (kept[s.id] || s.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return kept;
  }

  // Live sub-agents of `addr`, depth first, with their tree lines.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [{ t: k, lines: [...lead, last ? "└" : "├"] }, ...this.tree(all, k.address, [...lead, last ? "" : "│"])];
    });
  }

  status(t, st, small = false) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (st === "blocked" && small) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (st === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (st === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    if (st === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    return div().size(7).mx(3).flex_none();
  }

  spaceRow(s, t, fill, mine, cx) {
    const open = !this.folded.has(s.id);
    return h_flex()
      .id(`space-${s.id}`)
      .px(8)
      .h(30)
      .flex_none()
      .gap(9)
      .items_center()
      .rounded(8)
      .when(s.active, (el) => el.bg(t.selected))
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }))
      .child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#0a0a12").child([...s.name][0]?.toUpperCase() ?? "?"))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_shrink_0().max_w(150).truncate().text_color(t.foreground).child(s.name))
        .when(Boolean(s.branch), (el) => el.child(
          h_flex().min_w(0).gap(3).items_center().text_size(11).text_color(t.dim)
            .child(svg("mods/workspace-chrome/git-branch.svg").size(10).flex_none())
            .child(div().min_w(0).truncate().child(s.branch)))))
      .when(Boolean(s.machine), (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(s.machine)))
      .when(!open && Boolean(s.status) && s.status !== "idle", (el) => el.child(this.status(t, s.status, true)))
      .when(mine.length > 0, (el) => el.child(
        div().id(`fold-${s.id}`).flex_none().h(18).px(3).gap(3).flex().items_center().rounded(4).text_size(11).text_color(t.dim)
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggle(s.id, cx); })
          .when(!open, (el) => el.child(String(mine.length)))
          .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())));
  }

  subRow(s, t, depth = 1) {
    const k = s.t;
    const pic = icon(k.program, 13, t.foreground);
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(22 + depth * 16)
      .pr(8)
      .h(26)
      .flex_none()
      .items_center()
      .rounded(8)
      .text_size(12)
      .hover((st) => st.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : run("terminal.peek", { terminal: k.address })))
      .children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), (el) => el.child(div().mr(7).child(pic)))
      .child(div().flex_1().truncate().text_color(t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, kidStatus(k, this.listed), true));
  }

  // An agent's own title, else its program; a shell's title, else program and folder.
  paneLabel(p) {
    if (!p.terminal) return p.title || p.mod;
    const title = clean(p.title);
    const useful = title && title !== p.program?.name && title !== p.terminal && !/^[~/]/.test(title) && !title.includes("@");
    if (useful) return title;
    const dir = p.cwd ? p.cwd.replace(/\/+$/, "").split("/").pop() || "/" : "";
    return p.program?.agent || !dir ? p.program?.name ?? "terminal" : `${p.program?.name ?? "terminal"} · ${dir}`;
  }

  row(id, depth, t, { on, pic, label, st, dim, click, right, dbl }) {
    return h_flex().id(id).pl(14 + depth * 16).pr(8).h(28).flex_none().gap(8).items_center().rounded(8).text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); if (dbl && e.click_count === 2) dbl(); })
      .on_click(click)
      .when(Boolean(right), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); right(); }))
      .child(h_flex().w(15).flex_none().justify_center().when(Boolean(pic), (el) => el.child(pic)))
      .child(div().flex_1().min_w(0).truncate().text_color(dim ? t.muted : t.foreground).child(label))
      .child(this.status(t, st));
  }

  tabRows(s, tab, t, all, order) {
    const mine = panes().filter((p) => p.tab === tab.id);
    const shown = s.active && tab.active;
    const menu = () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: s.id } } });
    const rename = () => run("tab.rename", { id: tab.id });
    const paneRow = (p, depth, extra) => {
      if (p.status) order.push(p.terminal);
      return [
        this.row(`pn-${p.pane}`, depth, t, {
          on: shown && (mine.length === 1 || p.focused), pic: icon(p.program, 15, t.foreground),
          label: p.zoomed ? `${this.paneLabel(p)}  Z` : this.paneLabel(p), st: p.status,
          dim: !shown && (!p.status || p.status === "idle"),
          click: () => run("pane.focus", { pane: p.pane }), ...extra,
        }),
        ...(p.terminal ? this.tree(all, p.terminal).map((k) => this.subRow(k, t, depth)) : []),
      ];
    };
    if (mine.length === 1) return paneRow(mine[0], 1, { on: shown, right: menu, dbl: rename, ...(tab.named ? { label: tab.name } : {}) });
    return [
      this.row(`tb-${tab.id}`, 1, t, {
        on: false, pic: svg("mods/workspace-chrome/layers.svg").size(13).text_color(t.dim),
        label: tab.named ? tab.name : `Tab ${tab.index}`, st: null, dim: !shown,
        click: () => run("pane.focus", { pane: (mine.find((p) => p.focused) ?? mine[0])?.pane }), right: menu, dbl: rename,
      }),
      ...mine.flatMap((p) => paneRow(p, 2, {})),
    ];
  }

  compact(s, i, t) {
    return h_flex().flex_none().justify_center().child(h_flex()
      .id(`space-${s.id}`)
      .relative()
      .w(32)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(s.active, (el) => el.bg(t.selected))
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .on_click(() => run("space.select", { id: s.id }))
      .child(div().text_color(s.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(t[s.status] ?? t.dim).child(s.status === "blocked" || s.status === "done" ? "●" : "·")));
  }

  render(cx) {
    const t = theme();
    const sp = spaces();
    const colors = this.colors(sp);
    const collapsed = narrow();
    const list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    // Sub-agents that also have a pane would otherwise appear twice.
    const nested = new Set(list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    const top = list.filter((a) => !nested.has(a.address));

    const order = [];
    const rows = collapsed
      ? sp.map((s, i) => this.compact(s, i, t))
      : sp.flatMap((s) => {
          const fill = MARK[colors[s.id] ?? "ansi6"] ?? t[colors[s.id]] ?? colors[s.id];
          const head = this.spaceRow(s, t, fill, s.tabs, cx);
          if (this.folded.has(s.id)) return [head];
          return [head, ...s.tabs.flatMap((tab) => this.tabRows(s, tab, t, all, order)),
            ...(s.active ? [this.row(`tab-new-${s.id}`, 1, t, {
              pic: svg("mods/workspace-chrome/plus.svg").size(12).text_color(t.dim), label: "New tab", dim: true,
              click: () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }),
            })] : [])];
        });
    setAgentOrder([...order, ...top.filter((a) => !order.includes(a.address)).map((a) => a.address)]);

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(v_flex().id("tree").flex_1().min_h(0).px(collapsed ? 0 : 8).pt(10).pb(14).gap(1).overflow_y_scrollbar().mode("always").children(rows)
        .child(h_flex().id("space-new").on_mouse_down("left", (_e, cx) => cx.stop_propagation()).h(28).mt(4).px(collapsed ? 0 : 8).gap(9).items_center().rounded(8).text_color(t.dim)
          .when(collapsed, (el) => el.w(32).justify_center())
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new"))
          .child(h_flex().size(18).flex_none().items_center().justify_center().child(svg("mods/workspace-chrome/plus.svg").size(13)))
          .when(!collapsed, (el) => el.child("New space"))))
      .child(h_flex().flex_none().h(34).px(collapsed ? 0 : 10).items_center().when(collapsed, (el) => el.justify_center()).when(!collapsed, (el) => el.justify_end())
        .child(h_flex().id("more").size(26).items_center().justify_center().rounded(6).text_color(t.dim).relative()
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => openOverlay({ mod: "more-menu", kind: "popup" }))
          .child("⋯")
          .when(Boolean(updates().app.ready), (el) => el.child(div().absolute().top(4).right(4).size(5).rounded_full().bg(t.accent)))));
  }
}
