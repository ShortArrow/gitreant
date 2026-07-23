import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandPalette } from "../CommandPalette";
import type { PaletteCommand } from "../palette";

const command = (id: string, title: string): PaletteCommand => ({
  id,
  title,
  run: () => console.log("run", id),
});

const commands = [
  command("fetch", "Fetch remotes"),
  command("reload", "Reload repositories"),
  command("log", "Toggle command log"),
  command("settings", "Open settings"),
  command("theme", "Toggle theme"),
  command("squash-links", "Toggle squash-merge links"),
  command("stash-internals", "Toggle stash internals"),
  command("open-a", "Open repository: repoA"),
  command("open-b", "Open repository: repoB"),
  command("checkout-main", "Checkout branch: main"),
];

const meta: Meta<typeof CommandPalette> = {
  title: "Palette/CommandPalette",
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof CommandPalette>;

/** Interactive: type to filter, arrows to move, Enter logs the command. */
export const Default: Story = {
  args: { commands, onClose: () => console.log("close") },
};

/** No registered commands: the empty label shows right away. */
export const Empty: Story = {
  args: { commands: [], onClose: () => console.log("close") },
};
