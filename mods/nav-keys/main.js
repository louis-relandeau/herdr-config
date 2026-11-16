// Keys: the space tree's own keys and the global ones (read live from keys.json).

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { keys, props, closeOverlay, theme, settings } from "herdr";

const TREE = [
  ["j k  ↑ ↓", "Move"],
  ["Enter  Space", "Go there"],
  ["l  →", "Unfold space"],
  ["h  ←", "Fold space / jump to its space"],
  ["g G  Home End", "Top / bottom"],
  ["?", "These keys"],
  ["Esc", "Back to the panes"],
];

const NAV = [
  [/^space\.select:\d$/, "Space N"],
  [/^space\.next$/, "Next space"],
  [/^space\.prev$/, "Previous space"],
  [/^tab\.select:\d$/, "Tab N"],
  [/^tab\.next$/, "Next tab"],
  [/^tab\.prev$/, "Previous tab"],
  [/^agent\.next$/, "Next agent"],
  [/^agent\.prev$/, "Previous agent"],
  [/^space-tree\.agent-done$/, "Next done / needs-you agent"],
  [/^space-tree\.pane-next$/, "Next pane"],
  [/^space-tree\.pane-prev$/, "Previous pane"],
  [/^pane\.go:left$/, "Pane left (into the tree)"],
  [/^pane\.go:right$/, "Pane right"],
  [/^pane\.go:up$/, "Pane up"],
  [/^pane\.go:down$/, "Pane down"],
  [/^mod\.open:nav-keys$/, "These keys"],
];

const ACTIONS = [
  [/^layout\.toggle:sidebar$/, "Sidebar"],
  [/^layout\.toggle:agent-todos$/, "Agent todos panel"],
  [/^layout\.toggle:notes$/, "Notes panel"],
  [/^mod\.open:picker$/, "Find space"],
  [/^app\.palette$/, "Commands"],
  [/^space\.new$/, "New space"],
  [/^tab\.new$/, "New tab"],
  [/"tab\.new".*"claude"/, "New Claude tab"],
  [/^pane\.split:right$/, "Split right"],
  [/^pane\.split:down$/, "Split down"],
  [/^pane\.zoom$/, "Zoom pane"],
  [/^pane\.close$/, "Close pane"],
  [/^tab\.close$/, "Close tab"],
  [/^tab\.rename$/, "Rename tab"],
  [/^space\.rename$/, "Rename space"],
  [/^layout\.switch$/, "Switch layout"],
  [/^app\.settings$/, "Settings"],
  [/^app\.help$/, "Help"],
];

const TERMINAL = [
  [/^terminal\.copy$/, "Copy", /shift-c$/],
  [/^terminal\.paste$/, "Paste", /shift-v$/],
  [/^terminal\.paste_image$/, "Paste image"],
  [/^terminal\.search$/, "Search"],
  [/^send:\u0017$/, "Delete word"],
  [/^send:\u001bb$/, "Word left"],
  [/^send:\u001bf$/, "Word right"],
];

const NOTES = [
  [/^notes\.todos$/, "Todos"],
  [/^notes\.log$/, "Log"],
  [/^notes\.switch$/, "Switch note", /^ctrl-tab$/],
  [/^notes\.leave$/, "Leave notes"],
];

// Collapses alt-1 … alt-9 into one "alt-1…9".
function globalRows(table, section = "global") {
  const g = keys().filter((k) => k.section === section);
  return table.flatMap(([re, what, pick]) => {
    const ks = g.filter((k) => re.test(k.action)).map((k) => k.keys).filter((k, _i, all) => !pick || !all.some((a) => pick.test(a)) || pick.test(k));
    if (!ks.length) return [];
    const n = ks.filter((k) => /-\d$/.test(k));
    const rest = ks.filter((k) => !/-\d$/.test(k));
    const span = n.length > 1 ? [`${n[0]}…${n[n.length - 1].slice(-1)}`] : n;
    return [[[...span, ...rest].slice(0, 2).join("  "), what]];
  });
}

export default class NavKeys extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(100, () => this.handle.focus());
  }

  section(t, title, rows, keyW) {
    return v_flex().gap(2).flex_none()
      .child(div().mb(2).text_size(11.5).font_medium().text_color(t.dim).child(title))
      .children(rows.map(([k, what]) => h_flex().min_h(26).px(8).gap(12).items_center().rounded(6).hover((s) => s.bg(t.hover))
        .child(div().w(keyW).flex_none().whitespace_nowrap().text_color(t.foreground).font_family(settings().font_family).text_size(11.5).child(k))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(what))));
  }

  render() {
    const t = theme();
    const close = () => closeOverlay(props().overlay);
    return v_flex().id("nav-keys").track_focus(this.handle)
      .on_key_down((e) => { if (e.key === "escape" || e.key === "?" || e.key === "enter") close(); })
      .size_full().min_h(0).p(18).gap(14).bg(t.popover).text_size(12.5)
      .child(h_flex().h(22).items_center().justify_between()
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Keys"))
        .child(div().id("esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(close).child("Esc")))
      .child(h_flex().items_start().gap(24)
        .child(div().flex_1().child(this.section(t, "Navigate", globalRows(NAV), 230)))
        .child(div().w(1).self_stretch().bg(t.border))
        .child(div().flex_1().child(this.section(t, "Panels & actions", globalRows(ACTIONS), 190)))
        .child(div().w(1).self_stretch().bg(t.border))
        .child(v_flex().flex_1().gap(14)
          .child(this.section(t, "In the tree (alt-h to enter)", TREE, 150))
          .child(this.section(t, "In a terminal", globalRows(TERMINAL, "terminal"), 150))
          .child(this.section(t, "In notes", globalRows(NOTES, "mod:notes"), 150))));
  }
}
