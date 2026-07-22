import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommitDetailPanel } from "../CommitDetailPanel";
import { commitDetail, richMessageDetail, summaryOnlyDetail } from "./mock";

const meta: Meta<typeof CommitDetailPanel> = {
  title: "Pane/CommitDetailPanel",
  component: CommitDetailPanel,
  parameters: { layout: "padded" },
  args: {
    onClose: () => {},
    onSelectFile: () => {},
    onOpenFile: () => {},
    onShowAllDiffs: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof CommitDetailPanel>;

export const WithBodyAndFiles: Story = {
  args: { detail: commitDetail, error: null },
};

/** Every message shape at once — prose that rejoins its hard wraps,
 * wrapped bullets, an indented code block, a fence and inline code.
 * The body starts expanded so the rendering is reviewable at a glance. */
export const RichMessage: Story = {
  args: { detail: richMessageDetail, error: null },
  decorators: [
    (StoryFn) => {
      localStorage.setItem("gitreant-body-open", "on");
      return <StoryFn />;
    },
  ],
};

/** No body: the expand bar must not render at all. */
export const SummaryOnly: Story = {
  args: { detail: summaryOnlyDetail, error: null },
};

export const Loading: Story = {
  args: { detail: null, error: null },
};

export const LoadError: Story = {
  args: { detail: null, error: "commit deadbeef not found" },
};
