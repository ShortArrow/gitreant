import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogPane } from "../LogPane";

const meta: Meta<typeof LogPane> = {
  title: "Pane/LogPane",
  component: LogPane,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof LogPane>;

export const WithEntries: Story = {
  args: {
    entries: [
      {
        time: 1_700_000_000,
        repo: "/repos/demo",
        command: "git -C /repos/demo fetch --all --prune --quiet",
        ok: true,
        message: "",
      },
      {
        time: 1_700_000_060,
        repo: "/repos/broken",
        command: "git -C /repos/broken fetch --all --prune --quiet",
        ok: false,
        message: "fatal: unable to access remote",
      },
    ],
  },
};

export const Empty: Story = {
  args: { entries: [] },
};
