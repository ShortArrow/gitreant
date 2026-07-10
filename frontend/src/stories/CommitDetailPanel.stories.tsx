import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommitDetailPanel } from "../CommitDetailPanel";
import { commitDetail } from "./mock";

const meta: Meta<typeof CommitDetailPanel> = {
  title: "Pane/CommitDetailPanel",
  component: CommitDetailPanel,
  parameters: { layout: "padded" },
  args: { onClose: () => {}, onSelectFile: () => {}, onShowAllDiffs: () => {} },
};
export default meta;

type Story = StoryObj<typeof CommitDetailPanel>;

export const WithBodyAndFiles: Story = {
  args: { detail: commitDetail, error: null },
};

export const Loading: Story = {
  args: { detail: null, error: null },
};

export const LoadError: Story = {
  args: { detail: null, error: "commit deadbeef not found" },
};
