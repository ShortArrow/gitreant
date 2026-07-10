import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDiffPane } from "../FileDiffPane";
import { fileDiff } from "./mock";

const meta: Meta<typeof FileDiffPane> = {
  title: "Pane/FileDiffPane",
  component: FileDiffPane,
  parameters: { layout: "padded" },
  args: { onClose: () => {} },
};
export default meta;

type Story = StoryObj<typeof FileDiffPane>;

export const SingleFile: Story = {
  args: { files: [fileDiff], error: null },
};

export const WholeCommit: Story = {
  args: {
    files: [
      fileDiff,
      {
        path: "docs/README.md",
        status: "A",
        binary: false,
        text: "@@ -0,0 +1,2 @@\n+# gitreant\n+Commit graphs for local repos.\n",
      },
      { path: "assets/logo.png", status: "M", binary: true, text: "" },
    ],
    error: null,
  },
};

export const Loading: Story = {
  args: { files: null, error: null },
};
