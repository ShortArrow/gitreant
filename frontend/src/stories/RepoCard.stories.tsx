import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepoCard } from "../RepoCard";
import { erroredRepo, linearRepo, mergeRepo } from "./mock";

const meta: Meta<typeof RepoCard> = {
  title: "Pane/RepoCard",
  component: RepoCard,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof RepoCard>;

export const MergeHistory: Story = {
  args: { repo: mergeRepo },
};

export const Linear: Story = {
  args: { repo: linearRepo },
};

export const ReadError: Story = {
  args: { repo: erroredRepo },
};
