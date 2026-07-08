import type { Preview } from "@storybook/react-vite";
import "../src/styles.css";

// Toolbar switch so parts can be inspected in both themes.
export const globalTypes = {
  theme: {
    description: "Theme",
    defaultValue: "dark",
    toolbar: {
      icon: "circlehollow",
      items: [
        { value: "light", title: "Light" },
        { value: "dark", title: "Dark" },
      ],
      dynamicTitle: true,
    },
  },
};

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = String(context.globals.theme);
      return <Story />;
    },
  ],
};

export default preview;
