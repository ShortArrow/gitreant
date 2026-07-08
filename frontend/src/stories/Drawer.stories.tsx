import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Drawer } from "../Drawer";
import { linearRepo, mergeRepo } from "./mock";

const repos = [mergeRepo, linearRepo];

const meta: Meta<typeof Drawer> = {
  title: "Drawer/Drawer",
  component: Drawer,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Drawer>;

/** Interactive: collapse/expand and selection work locally. */
export const Default: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(repos[0].id);
    return (
      <div style={{ height: "100vh", display: "flex" }}>
        <Drawer
          repos={repos}
          activeId={activeId}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onSelect={setActiveId}
          onRemove={(id) => console.log("remove", id)}
          onAdd={async (path) => console.log("add", path)}
        />
      </div>
    );
  },
};

export const Collapsed: Story = {
  args: {
    repos,
    activeId: repos[0].id,
    collapsed: true,
    onToggle: () => {},
    onSelect: () => {},
    onRemove: () => {},
    onAdd: async () => {},
  },
};

export const Empty: Story = {
  args: {
    repos: [],
    activeId: null,
    collapsed: false,
    onToggle: () => {},
    onSelect: () => {},
    onRemove: () => {},
    onAdd: async () => {},
  },
};
