import { View, div } from "gpui-kit";
import { terminals, exec } from "herdr";

// Resumes Claude sessions in terminals that came back as plain shells (reboot, core crash).
// claude-hook.sh labels each terminal with its session; a clean exit removes the label.
export default class AgentResume extends View {
  init(_props, cx) {
    this.busy = false;
    cx.timer.every(5000, (cx) => this.scan(cx));
    this.scan(cx);
  }

  scan(cx) {
    if (this.busy) return;
    const todo = terminals().filter((t) => {
      const l = t.labels ?? {};
      return t.state === "live" && l["claude.session"] && l["claude.resume-tried"] !== l["claude.session"];
    });
    if (!todo.length) return;
    this.busy = true;
    cx.spawn(async () => {
      try {
        for (const t of todo) await this.resume(t);
      } finally {
        this.busy = false;
      }
    });
  }

  async resume(t) {
    const r = await exec("hc", ["get", t.address, "--json"]);
    const info = JSON.parse(r.stdout);
    if (info.foreground?.name === "claude") return;
    const id = info.labels["claude.session"];
    const cwd = info.labels["claude.cwd"];
    await exec("hc", ["label", t.address, `claude.resume-tried=${id}`]);
    const cd = cwd ? `cd '${cwd.replace(/'/g, `'\\''`)}' && ` : "";
    await exec("hc", ["send", t.address, `${cd}claude --resume ${id}`]);
  }

  render() {
    return div();
  }
}
