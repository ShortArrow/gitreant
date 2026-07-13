import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogPane } from "../LogPane";

const meta: Meta<typeof LogPane> = {
  title: "Pane/LogPane",
  component: LogPane,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof LogPane>;

export const WithItems: Story = {
  args: {
    items: [
      {
        time: 1_700_000_000,
        kind: "action",
        text: "Fetch remotes",
        ok: true,
      },
      {
        time: 1_700_000_001,
        kind: "command",
        text: "git -C /repos/demo fetch --all --prune --quiet",
        ok: true,
      },
      {
        time: 1_700_000_060,
        kind: "command",
        text: "git -C /repos/broken fetch --all --prune --quiet",
        ok: false,
        message: "fatal: unable to access remote",
      },
    ],
  },
};

export const Empty: Story = {
  args: { items: [] },
};
