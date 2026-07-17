import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommitMenu } from "../CommitMenu";

const meta: Meta<typeof CommitMenu> = {
  title: "Menus/CommitMenu",
  component: CommitMenu,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof CommitMenu>;

/** Interactive: actions first; picking one swaps in the name input. */
export const Default: Story = {
  args: {
    x: 24,
    y: 24,
    commit: "4043bc624ad30d6cd059d892a8ceb3b7cc9da79a",
    onCreateTag: (name: string) => console.log("tag", name),
    onCreateBranch: (name: string) => console.log("branch", name),
    onClose: () => console.log("close"),
  },
};
