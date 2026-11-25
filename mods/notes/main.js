import { View, div } from "gpui-kit";
import { v_flex, h_flex, Textarea, TextareaState, InputState, Input, ScrollHandle } from "gpui-base";
import { home, theme, settings, layout, focused, run, nextCommand, readTextFile, writeTextFile } from "herdr";

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const HEADER = /^[A-Z][a-z]+\.? \d{1,2} \d{4}\s*$/;
const OPEN = /^(\d{1,2})[.:](\d{2})-\s*$/;
const RANGE = /^(\d{1,2})[.:](\d{2})-(\d{1,2})[.:](\d{2})\s*$/;

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const r = find(c, id); if (r) return r; }
  return null;
}
// Same glass as the terminal panes.
const paneGlass = t => find(layout(), "main")?.content?.pane?.background ?? t.background;

const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`; };
const now = () => { const d = new Date(); return `${pad(d.getHours())}.${pad(d.getMinutes())}`; };
const mins = d => d.getHours() * 60 + d.getMinutes();
const dur = m => `${Math.floor(m / 60)}h ${pad(m % 60)}m`;

// Splits the log into everything before today's header and today's section.
function split(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (HEADER.test(lines[i])) {
      if (lines[i].trim() !== today()) break;
      return [lines.slice(0, i).join("\n") + "\n", lines.slice(i).join("\n")];
    }
  }
  return [text, ""];
}

const utf8 = s => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };

function findHidden(node, id, up = false) {
  if (!node || typeof node !== "object") return null;
  const h = up || !!node.hidden;
  if (node.id === id) return h;
  for (const c of node.children ?? []) { const r = findHidden(c, id, h); if (r !== null) return r; }
  return null;
}

class Doc {
  constructor(path, cx, onLoad) {
    this.path = path; this.disk = null; this.ver = 0; this.saved = 0; this.error = null;
    this.onLoad = onLoad;
    this.state = TextareaState.new({ value: "" });
    this.state.set_soft_wrap(true);
    this.state.on("change", (_e, cx) => this.changed(cx));
  }
  text() { return this.state.value(); }
  changed(cx) {
    if (this.applying) return;
    const v = ++this.ver;
    cx.timer.after(600, cx => { if (v === this.ver) this.save(cx); });
    cx.notify();
  }
  // Disk content is compose(editor value); subclasses override.
  compose(value) { return value; }
  decompose(text) { return text; }
  set(value) { this.applying = true; this.state.set_value(value); this.applying = false; }
  async load(cx) {
    try {
      const text = (await readTextFile(this.path)) ?? "";
      this.error = null;
      if (text === this.disk) return;
      if (this.ver !== this.saved) return;
      this.disk = text;
      this.set(this.decompose(text));
      cx.notify();
    } catch (e) { this.error = String(e); cx.notify(); }
  }
  save(cx) {
    const v = this.ver, text = this.compose(this.text());
    if (text === this.disk) { this.saved = v; return; }
    cx.spawn(async cx => {
      try { await writeTextFile(this.path, text, this.disk); this.disk = text; this.saved = v; this.error = null; }
      catch (e) { this.error = "Changed on disk, reloaded"; this.saved = this.ver; this.disk = null; await this.load(cx); }
      cx.notify();
    });
  }
  edit(cx, fn) { this.set(fn(this.text())); this.changed(cx); this.save(cx); }
}

// Blank lines shown under the text so typing on the last line doesn't sit on the edge; never saved.
const PAD = "\n".repeat(6);
class Todos extends Doc {
  decompose(text) { this.tail = text.match(/\s*$/)[0]; return text.replace(/\s+$/, "") + PAD; }
  compose(value) { const body = value.replace(/\s+$/, ""); return body ? body + (this.tail || "\n") : ""; }
}

const BIG = 100000;
// Today's section in `state`, earlier days in `hist`; both editable, saved as one file.
class Log extends Doc {
  constructor(...a) {
    super(...a);
    this.state.set_auto_grow(1, BIG);
    this.hist = TextareaState.new({ value: "" });
    this.hist.set_soft_wrap(true);
    this.hist.set_auto_grow(1, BIG);
    this.hist.on("change", (_e, cx) => this.changed(cx));
  }
  decompose(text) {
    const [head, day] = split(text);
    this.applying = true; this.hist.set_value(head.replace(/\s+$/, "")); this.applying = false;
    return day;
  }
  compose(value) {
    const head = this.hist.value().replace(/\s+$/, "");
    if (!value.trim()) return head ? head + "\n" : "";
    return (head ? head + "\n\n" : "") + value.replace(/^\n+/, "");
  }
  open() { const l = this.text().split("\n").reverse().find(l => OPEN.test(l) || RANGE.test(l)); return l && OPEN.test(l) ? l.match(OPEN) : null; }
  total() {
    let m = 0;
    for (const l of this.text().split("\n")) {
      const r = l.match(RANGE); if (r) m += (+r[3] * 60 + +r[4]) - (+r[1] * 60 + +r[2]);
      const o = l.match(OPEN); if (o) m += Math.max(0, mins(new Date()) - (+o[1] * 60 + +o[2]));
    }
    return m;
  }
}

export default class Notes extends View {
  init(_props, cx) {
    const dir = `${home()}/Documents`;
    this.tab = "todos";
    try { this.tab = localStorage.getItem("tab") || "todos"; } catch {}
    this.todos = new Todos(`${dir}/todos.txt`, cx);
    this.log = new Log(`${dir}/work-times.txt`, cx);
    this.scroll = ScrollHandle.new();
    this.task = InputState.new({ placeholder: "Add task, Enter…" });
    this.task.on("submit", (e, cx) => e.secondary ? this.startStop(cx) : this.addTask(cx));
    this.reload(cx);
    cx.timer.every(3000, cx => this.reload(cx));
    cx.timer.every(30000, cx => cx.notify());
    // A hidden copy doesn't render, so notice hiding here.
    cx.timer.every(300, () => { if (findHidden(layout(), "notes")) this.wasHidden = true; });
    cx.spawn(async cx => {
      for (;;) {
        const c = await nextCommand();
        if (c === "todos" || c === "log") this.tab = c;
        else if (c === "switch") this.tab = this.tab === "todos" ? "log" : "todos";
        else if (c === "leave") { this.leave(); continue; }
        if (this.tab === "log") this.toToday();
        this.focus();
        try { localStorage.setItem("tab", this.tab); } catch {}
        cx.notify();
      }
    });
  }

  focus(atEnd) {
    if (this.tab === "log") { this.task.focus(); return; }
    const doc = this.tab === "log" ? this.log : this.todos;
    if (atEnd || !doc.placed) {
      const n = utf8(doc.text().replace(/\s+$/, ""));
      try { doc.state.set_selected_range({ start: n, end: n }); doc.placed = true; } catch {}
    }
    doc.state.focus();
  }

  leave() {
    const p = this.lastPane;
    if (p) run("pane.focus", { pane: p });
  }

  // Focus the panel when it becomes visible, return to the terminal when hidden.
  watchShown(cx) {
    const hidden = findHidden(layout(), "notes");
    const pane = focused()?.pane;
    if (pane) this.lastPane = pane;
    if (hidden !== (this.wasHidden ?? true)) {
      this.wasHidden = hidden;
      if (hidden) this.leave(); else for (const ms of [30, 150, 400]) cx.timer.after(ms, () => this.focus(true));
    }
  }

  reload(cx) {
    if (this.day !== today()) { this.day = today(); this.log.disk = null; }
    cx.spawn(async cx => {
      await this.todos.load(cx);
      const before = this.log.disk;
      await this.log.load(cx);
      if (this.log.disk !== before) this.toToday();
    });
  }

  started(v) {
    const body = v.replace(/\s+$/, "");
    const head = split(v)[1] ? "" : `${today()}\n\n`;
    return (body ? body + "\n\n" : "") + head + `${now()}-\n`;
  }

  // Today's section at the top of the view; history sits above it.
  toToday() { this.scroll.scroll_to_item(1); }

  caret(state, at) { try { state.set_selected_range({ start: at, end: at }); } catch {} state.focus(); }

  // Up on today's first line moves into history; down on history's last line comes back.
  logKeys(e, cx) {
    if (e.modifiers.control || e.modifiers.alt || e.modifiers.shift || e.modifiers.platform) return;
    const today = this.log.state, hist = this.log.hist;
    if (e.key === "up" && today.selected_range().start <= Math.max(0, this.log.text().indexOf("\n")) && hist.value()) {
      if (today.selected_range().start !== today.selected_range().end) return;
      cx.stop_propagation();
      this.caret(hist, utf8(hist.value()));
      this.scroll.scroll_to_item(0);
    } else if (e.key === "down") {
      const v = hist.value(), r = hist.selected_range();
      if (r.start !== r.end || r.start < utf8(v.slice(0, v.lastIndexOf("\n") + 1))) return;
      cx.stop_propagation();
      this.caret(today, 0);
      this.toToday();
    }
  }

  logBody(t, font) {
    const hist = this.log.hist.value();
    const area = state => Textarea.new(state).w_full().p(6).font_family(font).text_size(13).bg("#00000000");
    return div().id("notes-log").flex_1().min_h(0).p(6)
      .on_size_change((size, cx) => { this.viewH = size.height - 12; this.toToday(); cx.notify(); })
      .child(v_flex().id("notes-log-scroll").size_full().overflow_y_scrollbar().track_scroll(this.scroll)
        .on_key_down((e, cx) => this.logKeys(e, cx))
        .child(div().when(!!hist, d => d.border_b(1).border_color(t.border).opacity(0.75)).child(hist ? area(this.log.hist) : div()))
        .child(v_flex().min_h(this.viewH ?? 0)
          .child(area(this.log.state))
          .child(div().id("notes-today-rest").flex_1().min_h(0).cursor_text().on_click(() => this.focusToday()))));
  }

  focusToday() { this.caret(this.log.state, utf8(this.log.text().replace(/\s+$/, ""))); }

  start(cx) { this.log.edit(cx, v => this.started(v)); }

  stop(cx) {
    this.log.edit(cx, v => {
      const lines = v.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) if (OPEN.test(lines[i])) { lines[i] = lines[i].trim() + now(); break; }
      return lines.join("\n");
    });
  }

  startStop(cx) {
    this.log.open() ? this.stop(cx) : this.start(cx);
    cx.notify();
  }

  addTask(cx) {
    const task = this.task.value().trim();
    if (!task) return;
    // One edit: two back-to-back saves race and the second is rejected as a disk conflict.
    const running = !!this.log.open();
    this.log.edit(cx, v => (running ? v : this.started(v)).replace(/\s+$/, "") + `\n- ${task}\n`);
    this.task.set_value("");
  }

  select(tab, cx) { this.tab = tab; if (tab === "log") this.toToday(); try { localStorage.setItem("tab", tab); } catch {} cx.notify(); }

  tabButton(id, label, t) {
    const on = this.tab === id;
    return div().id(`notes-tab-${id}`).px(10).py(4).rounded(6).cursor_pointer().text_size(12)
      .text_color(on ? t.foreground : t.muted).when(on, s => s.bg(t.selected)).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => this.select(id, cx)).child(label);
  }

  button(id, label, t, fn, primary) {
    return div().id(id).px(10).py(5).rounded(6).cursor_pointer().text_size(12).flex_none()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .border_1().border_color(primary ? t.solid : t.border).hover(s => s.opacity(0.85))
      .on_click((_e, cx) => fn(cx)).child(label);
  }

  logBar(t) {
    const o = this.log.open(), total = this.log.total();
    const since = o ? `Working since ${pad(o[1])}.${o[2]} · ${dur(Math.max(0, mins(new Date()) - (+o[1] * 60 + +o[2])))}` : "Not running";
    return v_flex().flex_none().p(10).gap(8).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().size(8).rounded(4).flex_none().bg(o ? t.working : t.idle))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(12).child(since))
          .child(div().truncate().text_size(11).text_color(t.dim).child(`Today ${dur(total)}`)))
        .child(o ? this.button("notes-stop", "Stop", t, cx => this.stop(cx)) : this.button("notes-start", "Start", t, cx => this.start(cx), true)))
      .child(Input.new(this.task).w_full().px(8).py(5).rounded(6).text_size(12).bg("#00000026").border_1().border_color(t.input));
  }

  render(cx) {
    this.watchShown(cx);
    const t = theme(), doc = this.tab === "log" ? this.log : this.todos, glass = paneGlass(t);
    const font = settings().font_family ?? "JetBrains Mono";
    return v_flex().id("notes").size_full().min_h(0).rounded(10).overflow_hidden().bg(glass)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(10).gap(4).items_center().border_b(1).border_color(t.border)
        .child(this.tabButton("todos", "Todos", t))
        .child(this.tabButton("log", "Work log", t))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(t.dim)
          .child(doc.error ?? (doc.ver !== doc.saved ? "Saving…" : doc.path.split("/").pop()))))
      .when(this.tab === "log", el => el.child(this.logBar(t)))
      .child(this.tab === "log" ? this.logBody(t, font)
        : div().flex_1().min_h(0).p(6).child(Textarea.new(doc.state).size_full().p(6).font_family(font).text_size(13).bg("#00000000")));
  }
}
