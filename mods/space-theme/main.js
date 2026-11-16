// Switches the void theme variant and its tinted galaxy background to match the shown space's color
// (shared "space.colors", set by space-tree).
import { View, div } from "gpui-kit";
import { focused, spaces, shared, run, layout } from "herdr";

// Pin a space to a variant by name, e.g. { "herdr config": "void-violet" }.
const OVERRIDES = {};

const BY_COLOR = { ansi6: "void", ansi3: "void-ember", ansi4: "void-blue", ansi5: "void-violet", ansi2: "void-mint", ansi1: "void-rose" };

export default class SpaceTheme extends View {
  render() {
    const id = focused()?.space;
    const space = spaces().find((s) => s.id === id);
    const name = OVERRIDES[space?.name] ?? BY_COLOR[(shared("space.colors") ?? {})[id]] ?? "void";
    const tree = layout();
    const image = `backgrounds/bh2-${name}.png`;
    // Only on a space switch: a layout edit in flight would otherwise be overwritten with a stale tree.
    if (id === this.space) return div();
    this.space = id;
    if (space && tree && (tree.theme !== name || tree.background?.image !== image)) {
      run("layout.set", { layout: { ...tree, theme: name, background: { image, fit: "cover" } } });
    }
    return div();
  }
}
