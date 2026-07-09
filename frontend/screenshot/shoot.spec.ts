import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { commitCount, featured, sidekick } from "./scenario";

const outDir = path.resolve(process.cwd(), "..", "docs", "images");

/** Open both scenario repos as tabs, leaving the featured one active. */
async function openRepos(page: Page) {
  await page.goto("/");
  await page.locator(`[data-repo-name="${sidekick.name}"]`).click();
  await page.locator(`[data-repo-name="${featured.name}"]`).click();
  await expect(page.getByTestId("commit-row")).toHaveCount(commitCount(featured));
}

for (const theme of ["dark", "light"] as const) {
  test(`captures the ${theme} screenshot`, async ({ page }) => {
    await page.addInitScript(
      (t) => localStorage.setItem("gitreant-theme", t),
      theme,
    );
    await openRepos(page);

    // The featured scenario must actually exercise the graph: several lanes,
    // and at least one cross-lane (curved) edge.
    const lanes = await page
      .locator('[data-testid="graph"] circle')
      .evaluateAll((els) => new Set(els.map((e) => e.getAttribute("cx"))).size);
    expect(lanes).toBeGreaterThanOrEqual(3);
    const curved = await page
      .locator('[data-testid="graph"] path')
      .evaluateAll((els) =>
        els.filter((e) => (e.getAttribute("d") ?? "").includes("C")).length,
      );
    expect(curved).toBeGreaterThan(0);

    await page.screenshot({
      path: path.join(outDir, `screenshot-${theme}.png`),
    });
  });
}
