import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepoCard } from "../RepoCard";
import { SettingsContext } from "../settings";
import {
  avatarRepo,
  commitDetail,
  erroredRepo,
  fileDiff,
  linearRepo,
  longMergeRepo,
  mergeRepo,
  stashRepo,
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

/** A stash with the internals toggle off: it folds down to a single node. */
export const StashCollapsed: Story = {
  args: { repo: stashRepo },
};

/** The same stash with the internals revealed: dashed links fan out to the
 * index and untracked-files helper commits. */
export const StashInternals: Story = {
  args: { repo: stashRepo },
  decorators: [
    (Story) => (
      <SettingsContext.Provider
        value={{
          buttonStyle: "icon-label",
          lang: "en",
          squashLinks: true,
          stashInternals: true,
          avatars: true,
        }}
      >
        <Story />
      </SettingsContext.Provider>
    ),
  ],
};

/** Commit rows with GitHub author avatars resolved by the server. */
export const Avatars: Story = {
  args: { repo: avatarRepo },
};

export const ReadError: Story = {
  args: { repo: erroredRepo },
};
