import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefMenu } from "../RefMenu";

const handlers = {
  onCheckout: (reference: string) => console.log("checkout", reference),
  onMerge: (reference: string) => console.log("merge", reference),
  onDeleteTag: (name: string) => console.log("delete tag", name),
  onClose: () => console.log("close"),
};

const meta: Meta<typeof RefMenu> = {
  title: "Menus/RefMenu",
  component: RefMenu,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof RefMenu>;

/** A branch badge menu: copy, checkout, and merge into the checked-out
 * branch. Mutating items switch to an inline confirmation. */
export const Branch: Story = {
  args: {
    target: { x: 24, y: 24, reference: "feature", kind: "branch" },
    headBranch: "main",
    ...handlers,
  },
};

/** With a detached HEAD there is no merge target: the item is disabled. */
export const BranchDetachedHead: Story = {
  args: {
    target: { x: 24, y: 24, reference: "feature", kind: "branch" },
    headBranch: undefined,
    ...handlers,
  },
};

/** A tag badge menu offers copy and delete instead of checkout/merge. */
export const Tag: Story = {
  args: {
    target: { x: 24, y: 24, reference: "v1.0", kind: "tag" },
    headBranch: "main",
    ...handlers,
  },
};
