import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { commit } from "./git";

const fixtures = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e/.tmp/fixtures.json"), "utf8"),
) as { repoC: string; repoD: string; repoE: string };

test.describe.serial("gitreant UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("drawer lists the served repositories", async ({ page }) => {
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
    await expect(page.locator('[data-repo-name="repoA"]')).toBeVisible();
    await expect(page.locator('[data-repo-name="repoB"]')).toBeVisible();
  });

  test("pane is empty until a repository is selected", async ({ page }) => {
    await expect(page.getByTestId("pane-empty")).toBeVisible();
    await expect(page.getByTestId("graph")).toHaveCount(0);
  });

  test("selecting repoA opens a tab and renders the graph", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();

    await expect(page.getByTestId("tab")).toHaveCount(1);
    await expect(page.locator('[data-tab-name="repoA"]')).toBeVisible();
    await expect(page.getByTestId("graph")).toBeVisible();

    // 5 commits -> 5 nodes and at least one edge.
    await expect(page.getByTestId("commit-row")).toHaveCount(5);
    await expect(page.locator('[data-testid="graph"] circle')).toHaveCount(5);
    expect(
      await page.locator('[data-testid="graph"] path').count(),
    ).toBeGreaterThan(0);
  });

  test("merge history spans multiple lanes", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const lanes = await page
      .locator('[data-testid="graph"] circle')
      .evaluateAll((els) => new Set(els.map((e) => e.getAttribute("cx"))).size);
    expect(lanes).toBeGreaterThanOrEqual(2);
  });

  test("clicking a commit row shows its message body and changed files", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();

    const panel = page.getByTestId("commit-detail");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("main-1");
    await expect(panel).toContainText("Second line of the description.");
    await expect(panel).toContainText("Tester");
    // Fixture commits are unsigned; the signature state is always shown.
    await expect(panel.getByTestId("detail-signature")).toHaveText("Not signed");

    // main-1 modified README.md (added one line).
    const file = panel.getByTestId("detail-file");
    await expect(file).toHaveCount(1);
    await expect(file).toContainText("README.md");
    await expect(file).toContainText("+1");

    await page.getByTestId("detail-close").click();
    await expect(panel).toHaveCount(0);
  });

  test("changed files can be shown as a directory tree", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-2" })
      .click();

    const panel = page.getByTestId("commit-detail");
    const files = panel.getByTestId("detail-file");
    // Flat view (default) shows full paths.
    await expect(files).toHaveCount(2);
    await expect(files.first()).toContainText("src/lib/one.ts");

    await panel.getByTestId("files-view-tree").click();
    // Tree view: the single-child directory chain is compressed into one
    // node, and file rows show only the file name.
    const dir = panel.getByTestId("detail-dir");
    await expect(dir).toHaveCount(1);
    await expect(dir).toContainText("src/lib");
    await expect(files).toHaveCount(2);
    await expect(files.first()).toContainText("one.ts");
    await expect(files.first()).not.toContainText("src/lib");

    await panel.getByTestId("files-view-flat").click();
    await expect(panel.getByTestId("detail-dir")).toHaveCount(0);
    await expect(files.first()).toContainText("src/lib/one.ts");
  });

  test("drawer and detail panel widths are adjustable by dragging", async ({
    page,
  }) => {
    // Widen the drawer by dragging its right-edge handle.
    const drawer = page.locator(".drawer");
    const drawerBefore = (await drawer.boundingBox())!;
    const drawerHandle = (await page.getByTestId("drawer-resize").boundingBox())!;
    await page.mouse.move(
      drawerHandle.x + drawerHandle.width / 2,
      drawerHandle.y + 200,
    );
    await page.mouse.down();
    await page.mouse.move(drawerHandle.x + 120, drawerHandle.y + 200);
    await page.mouse.up();
    const drawerAfter = (await drawer.boundingBox())!;
    expect(drawerAfter.width).toBeGreaterThan(drawerBefore.width + 80);

    // The width survives a reload.
    await page.reload();
    const drawerReloaded = (await page.locator(".drawer").boundingBox())!;
    expect(Math.abs(drawerReloaded.width - drawerAfter.width)).toBeLessThan(2);

    // Widen the detail panel by dragging its left-edge handle.
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();
    const panel = page.getByTestId("commit-detail");
    const panelBefore = (await panel.boundingBox())!;
    const panelHandle = (await page.getByTestId("detail-resize").boundingBox())!;
    await page.mouse.move(
      panelHandle.x + panelHandle.width / 2,
      panelHandle.y + 100,
    );
    await page.mouse.down();
    await page.mouse.move(panelHandle.x - 100, panelHandle.y + 100);
    await page.mouse.up();
    const panelAfter = (await panel.boundingBox())!;
    expect(panelAfter.width).toBeGreaterThan(panelBefore.width + 60);
  });

  test("remote refs show the remote name as a separate badge segment", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();

    const remoteBadge = page.locator(".badge-remote");
    await expect(remoteBadge).toHaveCount(1);
    await expect(remoteBadge.getByTestId("badge-remote")).toHaveText("origin");
    await expect(remoteBadge.locator(".badge-ref-name")).toHaveText("main");

    // The local branch badge stays a single segment.
    const localMain = page
      .locator(".badge-ref:not(.badge-remote)")
      .filter({ hasText: "main" });
    await expect(localMain).toHaveCount(1);
    await expect(localMain.getByTestId("badge-remote")).toHaveCount(0);
  });

  test("the HEAD commit is drawn as a hollow colored ring", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const graph = page.locator('[data-testid="graph"]');
    await expect(graph.locator("circle.node-head")).toHaveCount(1);

    const { stroke, fill, laneFill } = await graph.evaluate((g) => {
      const head = g.querySelector("circle.node-head")!;
      const peer = [...g.querySelectorAll("circle:not(.node-head)")].find(
        (c) => c.getAttribute("cx") === head.getAttribute("cx"),
      )!;
      return {
        stroke: getComputedStyle(head).stroke,
        fill: getComputedStyle(head).fill,
        laneFill: getComputedStyle(peer).fill,
      };
    });
    // The ring is the branch color; the center is punched out (background).
    expect(stroke).toBe(laneFill);
    expect(fill).not.toBe(laneFill);
  });

  test("reload button re-reads repositories from disk", async ({ page }) => {
    await page.getByTestId("add-input").fill(fixtures.repoE);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoE"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(1);

    // A commit lands in the repository outside of gitreant.
    commit(fixtures.repoE, "e-2");
    await expect(page.getByTestId("commit-row")).toHaveCount(1);

    await page.getByTestId("reload").click();
    await expect(page.getByTestId("commit-row")).toHaveCount(2);

    // Restore the served set.
    const repoE = page.locator('[data-repo-name="repoE"]');
    await repoE.hover();
    await repoE.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoE"]')).toHaveCount(0);
  });

  test("the commit list and the detail panel scroll independently", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.getByTestId("add-input").fill(fixtures.repoD);
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("commit-row")).toHaveCount(13);

    await page
      .getByTestId("commit-row")
      .filter({ hasText: "merge feature" })
      .click();
    await expect(page.getByTestId("commit-detail")).toBeVisible();

    // 13 rows do not fit in a 400px viewport: the list itself must scroll
    // (not the whole pane), leaving the detail panel in place.
    const list = page.locator(".graph-and-list");
    const scrollable = await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(scrollable).toBe(true);

    const panelBefore = (await page
      .getByTestId("commit-detail")
      .boundingBox())!;
    await list.evaluate((el) => {
      el.scrollTop = 150;
    });
    const panelAfter = (await page.getByTestId("commit-detail").boundingBox())!;
    expect(panelAfter.y).toBe(panelBefore.y);
    const detailScroll = await page
      .locator(".detail-scroll")
      .evaluate((el) => el.scrollTop);
    expect(detailScroll).toBe(0);

    // Restore the served set.
    const repoD = page.locator('[data-repo-name="repoD"]');
    await repoD.hover();
    await repoD.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoD"]')).toHaveCount(0);
  });

  test("branch edges keep the branch color end to end", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.getByTestId("graph")).toBeVisible();

    // nodeX(lane) = 14 + lane * 18 (frontend/src/graph.ts geometry).
    const laneFill = (lane: number) =>
      page
        .locator(`[data-testid="graph"] circle[cx="${14 + lane * 18}"]`)
        .first()
        .getAttribute("fill");
    const featureFill = await laneFill(1);
    const mainFill = await laneFill(0);
    expect(featureFill).not.toBe(mainFill);

    // repoA's two cross-lane (curved) edges — merge -> feature tip and
    // feature tip -> fork point — both belong to the feature branch, so they
    // must carry its color. The fork edge used to flip to main's color.
    const strokes = await page
      .locator('[data-testid="graph"] path')
      .evaluateAll((els) =>
        els
          .filter((e) => (e.getAttribute("d") ?? "").includes("C"))
          .map((e) => e.getAttribute("stroke")),
      );
    expect(strokes.length).toBe(2);
    for (const stroke of strokes) {
      expect(stroke).toBe(featureFill);
    }
  });

  test("a merge spanning many rows bends once, then runs vertically", async ({
    page,
  }) => {
    await page.getByTestId("add-input").fill(fixtures.repoD);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoD"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(13);

    const ds = await page
      .locator('[data-testid="graph"] path')
      .evaluateAll((els) => els.map((e) => e.getAttribute("d") ?? ""));
    const bent = ds
      .map((d) => /^M(\S+),(\S+) C\S+ \S+ (\S+),(\S+) L(\S+),(\S+)$/.exec(d))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({
        y1: Number(m[2]),
        xBend: Number(m[3]),
        yBend: Number(m[4]),
        x2: Number(m[5]),
        y2: Number(m[6]),
      }));

    // Cross-lane edges must not run diagonally across rows: the curve is
    // confined to a single row, the rest is a vertical line in the parent's
    // lane. At least one such edge spans many rows (merge -> feature-1).
    expect(bent.length).toBeGreaterThan(0);
    for (const e of bent) {
      expect(e.yBend - e.y1).toBe(32);
      expect(e.x2).toBe(e.xBend);
    }
    expect(
      Math.max(...bent.map((e) => e.y2 - e.yBend)),
    ).toBeGreaterThanOrEqual(5 * 32);

    // Restore the served set.
    const repoD = page.locator('[data-repo-name="repoD"]');
    await repoD.hover();
    await repoD.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoD"]')).toHaveCount(0);
  });

  test("opening a second repo adds a tab and switches panes", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click();

    await expect(page.getByTestId("tab")).toHaveCount(2);
    // repoB is active -> 3 commits.
    await expect(page.getByTestId("commit-row")).toHaveCount(3);

    // Switch back to repoA via its tab.
    await page.locator('[data-tab-name="repoA"]').click();
    await expect(page.getByTestId("commit-row")).toHaveCount(5);
  });

  test("closing a tab empties the pane", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.getByTestId("tab")).toHaveCount(1);

    await page.getByTestId("tab-close").first().click();
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect(page.getByTestId("pane-empty")).toBeVisible();
  });

  test("theme toggle flips the document theme", async ({ page }) => {
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    expect(before === "light" || before === "dark").toBe(true);

    await page.getByTestId("theme-toggle").click();

    const expected = before === "dark" ? "light" : "dark";
    await expect(html).toHaveAttribute("data-theme", expected);
  });

  test("collapsing the drawer hides the repository list", async ({ page }) => {
    await expect(page.getByTestId("repo-item").first()).toBeVisible();

    await page.getByTestId("drawer-collapse").click();
    await expect(page.getByTestId("repo-item")).toHaveCount(0);
    await expect(page.getByTestId("drawer-expand")).toBeVisible();

    await page.getByTestId("drawer-expand").click();
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
  });

  test("adding and removing a repository via the drawer", async ({ page }) => {
    await page.getByTestId("add-input").fill(fixtures.repoC);
    await page.getByTestId("add-submit").click();

    await expect(page.getByTestId("repo-item")).toHaveCount(3);
    await expect(page.locator('[data-repo-name="repoC"]')).toBeVisible();
    // Newly added repo is auto-opened as a tab with its 2 commits.
    await expect(page.locator('[data-tab-name="repoC"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(2);

    // Remove it again, restoring the served set.
    const repoC = page.locator('[data-repo-name="repoC"]');
    await repoC.hover();
    await repoC.getByTestId("repo-remove").click();
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
    await expect(page.locator('[data-repo-name="repoC"]')).toHaveCount(0);
  });

  test("browse button adds the folder returned by the picker", async ({
    page,
  }) => {
    // The native folder dialog can't be driven in a headless run, so stub the
    // pick endpoint and verify the browse -> add wiring end to end.
    await page.route("**/api/pick", (route) =>
      route.fulfill({ json: { path: fixtures.repoC } }),
    );

    await page.getByTestId("add-browse").click();
    await expect(page.locator('[data-repo-name="repoC"]')).toBeVisible();
    await expect(page.locator('[data-tab-name="repoC"]')).toBeVisible();

    // Restore the served set.
    const repoC = page.locator('[data-repo-name="repoC"]');
    await repoC.hover();
    await repoC.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoC"]')).toHaveCount(0);
  });
});
