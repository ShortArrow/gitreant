import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoPanel } from "../InfoPanel";

const meta: Meta<typeof InfoPanel> = {
  title: "Dialog/InfoPanel",
  component: InfoPanel,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: () => console.log("close"),
    loadAbout: async () => ({ version: "0.1.0", commit: "abc123def456" }),
  },
};
export default meta;

type Story = StoryObj<typeof InfoPanel>;

export const Default: Story = {};

/** The server is unreachable: the CLI row shows a placeholder. */
export const ServerUnreachable: Story = {
  args: {
    loadAbout: async () => {
      throw new Error("offline");
    },
  },
};
