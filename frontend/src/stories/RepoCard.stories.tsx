import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepoCard } from "../RepoCard";
import { commitDetail, erroredRepo, linearRepo, longMergeRepo, mergeRepo } from "./mock";

const meta: Meta<typeof RepoCard> = {
  title: "Pane/RepoCard",
  component: RepoCard,
  parameters: { layout: "padded" },
  // Clicking a commit row opens the detail panel with this mock.
  args: { loadDetail: async () => commitDetail },
};
export default meta;

type Story = StoryObj<typeof RepoCard>;

export const MergeHistory: Story = {
  args: { repo: mergeRepo },
};

export const LongSpanMerge: Story = {
  args: { repo: longMergeRepo },
};

export const Linear: Story = {
  args: { repo: linearRepo },
};

export const ReadError: Story = {
  args: { repo: erroredRepo },
};
