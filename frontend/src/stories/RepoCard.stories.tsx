import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepoCard } from "../RepoCard";
import {
  commitDetail,
  erroredRepo,
  fileDiff,
  linearRepo,
  longMergeRepo,
  mergeRepo,
} from "./mock";

const meta: Meta<typeof RepoCard> = {
  title: "Pane/RepoCard",
  component: RepoCard,
  parameters: { layout: "padded" },
  // Clicking a commit row opens the detail panel with this mock; clicking a
  // file (or "Diff all") in it opens the diff pane.
  args: {
    loadDetail: async () => commitDetail,
    loadDiff: async () => fileDiff,
    loadCommitDiff: async () => [fileDiff],
  },
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
