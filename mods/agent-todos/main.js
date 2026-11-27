// Each agent's own todo list, read from its terminal label herdr.todos (written by ./todo).
// Items may carry one level of sub-items (c); a finished parent collapses them.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals, panes, focused, layout, theme, run, exec } from "herdr";

const LABEL = "herdr.todos";
const BLOCK = "agent-todos";
// Darker veils over the glass: headers, the item in progress, hover.
const SHADE = "#00000040", DEEP = "#00000059", HOVER = "#00000026";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const r = find(c, id); if (r) return r; }
  return null;
}
// Same glass as the terminal panes, so the panel follows any change to their look.
const paneGlass = (t) => find(layout(), "main")?.content?.pane?.background ?? t.surface;

// null if the node isn't in the layout, else whether it or an ancestor is hidden.
function findHidden(node, id, up = false) {
  if (!node || typeof node !== "object") return null;
  const h = up || !!node.hidden;
  if (node.id === id) return h;
  for (const c of node.children ?? []) { const r = findHidden(c, id, h); if (r !== null) return r; }
  return null;
}

function parse(raw) {
  try {
    const v = JSON.parse(raw ?? "[]");
    const ok = (i) => i && typeof i.t === "string";
    return Array.isArray(v)
      ? v.filter(ok).map((i) => (Array.isArray(i.c) ? { ...i, c: i.c.filter(ok) } : i))
      : [];
  } catch {
    return [];
  }
}

// Same rule as ./todo: a parent with sub-items is done when they all are, in progress when one is.
function fix(list) {
  return list.map((it) => {
    if (!it.c?.length) return it;
    const s = it.c.every((c) => c.s === "done") ? "done"
      : it.c.some((c) => c.s === "doing") ? "doing"
      : it.s === "done" ? "todo" : it.s;
    return { ...it, s };
  });
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function agentPanes() {
  const tab = focused()?.tab;
  return panes().filter((p) => p.tab === tab && p.terminal && p.status);
}

export default class AgentTodos extends View {
  init(_props, cx) {
    this.hideDone = new Set();
    // Parents the user opened or closed by hand, overriding the done = collapsed default.
    this.flipped = new Set();
    // A hidden copy isn't re-rendered, so the show/hide check runs on a timer too.
    cx.timer.every(400, () => this.syncShown(agentPanes().length > 0));
  }

  // The user can tick items too; the agent sees it next time it lists.
  toggle(address, list, i, k) {
    const flip = (s) => (s === "done" ? "todo" : "done");
    const next = fix(list.map((it, j) => {
      if (j !== i) return it;
      if (k !== undefined) return { ...it, c: it.c.map((c, m) => (m === k ? { ...c, s: flip(c.s) } : c)) };
      const s = flip(it.s);
      return { ...it, s, ...(it.c ? { c: it.c.map((c) => ({ ...c, s })) } : {}) };
    }));
    const [machine, id] = address.includes("/") ? address.split("/") : [null, address];
    exec("hc", ["label", id, `${LABEL}=${JSON.stringify(next)}`], { on: machine }).catch(() => {});
  }

  item(t, address, list, it, i, k, fold) {
    const done = it.s === "done";
    const doing = it.s === "doing";
    const mark = done
      ? div().size(14).flex_none().rounded(4).bg(t.done).flex().items_center().justify_center()
          .child(svg("mods/workspace-chrome/check.svg").size(10).text_color(t.background))
      : doing
        ? div().size(14).flex_none().rounded(7).border(2).border_color(t.working).flex().items_center().justify_center()
            .child(div().size(6).rounded(3).bg(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 }))
        : div().size(14).flex_none().rounded(7).border(1).border_color(t.input);
    return h_flex()
      .id(`it-${address}-${i}${k === undefined ? "" : `-${k}`}`)
      .items_start()
      .gap(8)
      .pl(k === undefined ? 10 : 32)
      .pr(10)
      .py(4)
      .rounded(6)
      .when(doing, (el) => el.bg(DEEP))
      .hover((s) => s.bg(doing ? DEEP : HOVER))
      .cursor_pointer()
      .on_click(() => this.toggle(address, list, i, k))
      .child(div().pt(2).child(mark))
      .child(
        div().flex_1().min_w(0).whitespace_normal().text_size(13)
          .text_color(done ? t.dim : doing ? t.foreground : t.muted)
          .when(done, (el) => el.line_through())
          .when(doing, (el) => el.font_semibold())
          .child(it.t),
      )
      .when(!!fold, (el) => el.child(fold));
  }

  // Count and chevron on a parent; clicking it opens or closes the sub-items.
  fold(t, key, it, open) {
    const n = it.c.filter((c) => c.s === "done").length;
    return h_flex()
      .id(`fold-${key}`)
      .flex_none()
      .items_center()
      .gap(4)
      .pt(1)
      .text_size(11)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.flipped.has(key) ? this.flipped.delete(key) : this.flipped.add(key);
        cx.notify();
      })
      .child(`${n}/${it.c.length}`)
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none().text_color(t.dim));
  }

  // One section per agent pane: equal share of the panel height, its own scroll.
  card(t, entry, current, glass) {
    const { pane, list, name } = entry;
    const a = pane.terminal;
    const total = list.length;
    const n = list.filter((i) => i.s === "done").length;
    const hide = this.hideDone.has(a);
    const rows = [];
    list.forEach((it, i) => {
      if (hide && it.s === "done") return;
      if (!it.c?.length) return rows.push(this.item(t, a, list, it, i));
      const key = `${a}:${i}`;
      const open = (it.s !== "done") !== this.flipped.has(key);
      rows.push(this.item(t, a, list, it, i, undefined, this.fold(t, key, it, open)));
      if (open) it.c.forEach((c, k) => {
        if (!(hide && c.s === "done")) rows.push(this.item(t, a, list, c, i, k));
      });
    });

    const head = h_flex()
      .id(`head-${a}`)
      .flex_none()
      .items_center()
      .gap(8)
      .px(10)
      .h(34)
      .bg(SHADE)
      .border_b(1)
      .border_color(t.border)
      .cursor_pointer()
      .hover((s) => s.bg(DEEP))
      .on_click(() => run("pane.focus", { pane: pane.pane }))
      .child(icon(pane.program, 16, t.foreground))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(current ? t.foreground : t.muted).child(name))
      .when(!!t[pane.status], (el) => el.child(div().size(7).rounded(4).flex_none().bg(t[pane.status])))
      .when(total > 0, (el) => el.child(div().flex_none().text_size(11).text_color(n === total ? t.done : t.dim).child(`${n}/${total}`)))
      .when(n > 0, (el) => el.child(div().id(`hd-${a}`).flex_none().text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); hide ? this.hideDone.delete(a) : this.hideDone.add(a); cx.notify(); })
        .child(hide ? "show done" : "hide done")));

    const body = total
      ? v_flex().py(4).children(rows)
      : div().p(12).text_size(12).text_color(t.dim).whitespace_normal().child("No todos yet.");

    return v_flex()
      .id(`card-${a}`)
      .flex_1()
      .min_h(0)
      .rounded(8)
      .border(1)
      .border_color(current ? t.accent : t.border)
      .bg(glass)
      .overflow_hidden()
      .child(head)
      .child(div().id(`scroll-${a}`).flex_1().min_h(0).overflow_y_scrollbar().child(body));
  }

  // Hide the block when the shown tab has no agent pane; bring it back only if we hid it,
  // so ctrl-shift-y (layout.toggle) still turns it off for good.
  syncShown(want) {
    const hidden = findHidden(layout(), BLOCK);
    if (hidden === null) return;
    if (!want && !hidden) {
      this.autoHidden = true;
      run("layout.hide", { id: BLOCK });
    } else if (want && hidden && this.autoHidden) {
      this.autoHidden = false;
      run("layout.show", { id: BLOCK });
    }
  }

  render(cx) {
    const t = theme();
    const glass = paneGlass(t);
    const terms = new Map(terminals().map((x) => [x.address, x]));
    const entries = agentPanes()
      .map((pane) => {
        const term = terms.get(pane.terminal);
        const title = (pane.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
        return { pane, list: parse(term?.labels?.[LABEL]), name: title || pane.program?.name || pane.terminal };
      });
    this.syncShown(entries.length > 0);

    return v_flex()
      .size_full()
      .gap(8)
      .children(entries.map((e) => this.card(t, e, e.pane.focused, glass)));
  }
}
