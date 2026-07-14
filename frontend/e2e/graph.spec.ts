import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { commit } from "./git";

const fixtures = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e/.tmp/fixtures.json"), "utf8"),
) as {
  repoC: string;
  repoD: string;
  repoE: string;
  repoF: string;
  repoFOrigin: string;
  repoG: string;
  repoH: string;
  /** null when gpg is not installed on this machine. */
  repoI: string | null;
  repoJ: string;
  repoK: string;
};

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

  test("clicking a changed file opens its diff pane", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "README.md" })
      .click();

    // The diff pane replaces the graph until it is closed.
    const pane = page.getByTestId("diff-pane");
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("README.md");
    await expect(pane).toContainText("@@");
    await expect(pane.locator(".diff-line-add")).toContainText("+two");
    await expect(pane.locator(".diff-line-context")).toContainText(" one");
    await expect(page.getByTestId("graph")).toHaveCount(0);

    await page.getByTestId("diff-close").click();
    await expect(page.getByTestId("diff-pane")).toHaveCount(0);
    await expect(page.getByTestId("graph")).toBeVisible();
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

    const { stroke, fill, laneFill, cardBg } = await graph.evaluate((g) => {
      const head = g.querySelector("circle.node-head")!;
      const peer = [...g.querySelectorAll("circle:not(.node-head)")].find(
        (c) => c.getAttribute("cx") === head.getAttribute("cx"),
      )!;
      const card = g.closest(".repo")!;
      return {
        stroke: getComputedStyle(head).stroke,
        fill: getComputedStyle(head).fill,
        laneFill: getComputedStyle(peer).fill,
        cardBg: getComputedStyle(card).backgroundColor,
      };
    });
    // The ring is the branch color; the center is punched out to the card
    // background, so it follows the theme (dark center in dark mode).
    expect(stroke).toBe(laneFill);
    expect(fill).toBe(cardBg);
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

  test("the diff pane can switch between inline and side-by-side view", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "README.md" })
      .click();
    const pane = page.getByTestId("diff-pane");
    await expect(pane.locator(".diff-line-add")).toContainText("+two");

    await pane.getByTestId("diff-view-split").click();
    // main-1 turned "one" into "one\ntwo": the split view pairs the context
    // line on both sides and shows the added line on the right only.
    const rows = pane.locator(".split-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".split-cell-context")).toHaveCount(2);
    await expect(rows.nth(1).locator(".split-cell-empty")).toHaveCount(1);
    await expect(rows.nth(1).locator(".split-cell-add .split-text")).toHaveText(
      "two",
    );

    await pane.getByTestId("diff-view-inline").click();
    await expect(pane.locator(".diff-line-add")).toContainText("+two");
  });

  test("the whole commit diff can be opened at once", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-2" })
      .click();
    // main-2 changed two files; open every diff with one click.
    await page.getByTestId("diff-all").click();

    const pane = page.getByTestId("diff-pane");
    await expect(pane).toBeVisible();
    const sections = pane.getByTestId("diff-file-section");
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0)).toContainText("src/lib/one.ts");
    await expect(sections.nth(1)).toContainText("src/lib/two.ts");
    await expect(sections.nth(0).locator(".diff-line-add")).toContainText("+1");

    await page.getByTestId("diff-close").click();
    await expect(page.getByTestId("graph")).toBeVisible();
  });

  test("fetch button pulls new remote commits into the graph", async ({
    page,
  }) => {
    await page.getByTestId("add-input").fill(fixtures.repoF);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoF"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(1);

    // A commit lands on the origin; the clone doesn't know it yet.
    commit(fixtures.repoFOrigin, "f-2");
    await page.getByTestId("fetch").click();
    // The fetched remote-tracking ref makes the new commit reachable. The
    // round trip runs a real `git fetch` per served repository, so give it
    // more than the default 5 seconds.
    await expect(page.getByTestId("commit-row")).toHaveCount(2, {
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("commit-row").filter({ hasText: "f-2" }),
    ).toBeVisible();

    // Restore the served set.
    const repoF = page.locator('[data-repo-name="repoF"]');
    await repoF.hover();
    await repoF.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoF"]')).toHaveCount(0);
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
    const expand = page.getByTestId("drawer-expand");
    await expect(expand).toBeVisible();

    // The expand button sits horizontally centered in the collapsed rail
    // (a stray margin-left:auto used to push it against the right edge).
    const drawer = (await page.locator(".drawer-collapsed").boundingBox())!;
    const button = (await expand.boundingBox())!;
    const drawerCenter = drawer.x + drawer.width / 2;
    const buttonCenter = button.x + button.width / 2;
    expect(Math.abs(buttonCenter - drawerCenter)).toBeLessThanOrEqual(2);

    await expand.click();
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

  test("the page updates live when another client changes the repo set", async ({
    page,
  }) => {
    // Add via the HTTP API instead of this page's UI: only the SSE update
    // event can bring the change to the already-open page.
    const added = await page.request.post("/api/repos", {
      data: { path: fixtures.repoC },
    });
    expect(added.ok()).toBeTruthy();
    await expect(page.locator('[data-repo-name="repoC"]')).toBeVisible();

    const { id } = (await added.json()) as { id: string };
    const removed = await page.request.delete("/api/repos", {
      data: { path: id },
    });
    expect(removed.ok()).toBeTruthy();
    await expect(page.locator('[data-repo-name="repoC"]')).toHaveCount(0);
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
  });

  test("fetch failures surface as an error and clear on success", async ({
    page,
  }) => {
    await page.getByTestId("add-input").fill(fixtures.repoG);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-repo-name="repoG"]')).toBeVisible();

    // repoG's remote is unreachable, so fetching reports it.
    await page.getByTestId("fetch").click();
    await expect(page.locator(".app-error")).toBeVisible();
    await expect(page.locator(".app-error")).toContainText("repoG");

    // Without the broken repository the next fetch succeeds and clears it.
    const repoG = page.locator('[data-repo-name="repoG"]');
    await repoG.hover();
    await repoG.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoG"]')).toHaveCount(0);
    await page.getByTestId("fetch").click();
    await expect(page.locator(".app-error")).toHaveCount(0);
  });

  test("signed commits show a badge, ordered badge-author-hash", async ({
    page,
  }) => {
    await page.getByTestId("add-input").fill(fixtures.repoH);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoH"]')).toBeVisible();

    const signed = page
      .getByTestId("commit-row")
      .filter({ hasText: "signed tip" });
    await expect(signed.getByTestId("badge-signed")).toBeVisible();
    // The right-hand meta reads: signed badge, author, then the hash.
    const meta = (await signed.locator(".commit-meta").textContent()) ?? "";
    expect(meta).toMatch(/Signed.*Tester.*\b[0-9a-f]{7}\b/);

    const unsigned = page
      .getByTestId("commit-row")
      .filter({ hasText: "unsigned base" });
    await expect(unsigned.getByTestId("badge-signed")).toHaveCount(0);

    // Restore the served set.
    const repoH = page.locator('[data-repo-name="repoH"]');
    await repoH.hover();
    await repoH.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoH"]')).toHaveCount(0);
  });

  test("a commit signed with a known gpg key shows a Verified badge", async ({
    page,
    context,
  }) => {
    test.skip(!fixtures.repoI, "gpg is not installed on this machine");
    await page.getByTestId("add-input").fill(fixtures.repoI!);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoI"]')).toBeVisible();

    const verified = page
      .getByTestId("commit-row")
      .filter({ hasText: "verified tip" });
    const badge = verified.getByTestId("badge-signed");
    await expect(badge).toHaveText("Verified");
    await expect(badge).toHaveClass(/badge-verified/);

    // The detail pane names the verdict and the signing key, which copies.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await verified.click();
    await expect(page.getByTestId("detail-signature")).toContainText(
      "Signed (OpenPGP) — Verified",
    );
    const key = page.getByTestId("detail-signature-key");
    const keyText = (await key.textContent()) ?? "";
    expect(keyText).toMatch(/^[0-9A-Fa-f]{8,}$/);
    await key.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      keyText,
    );
    await page.getByTestId("detail-close").click();

    // The verification command lands in the command log.
    await page.getByTestId("log-toggle").click();
    await expect(
      page
        .getByTestId("log-pane")
        .getByTestId("log-entry")
        .filter({ hasText: "%H %G?" })
        .first(),
    ).toBeVisible();
    await page.getByTestId("log-toggle").click();

    // Restore the served set.
    const repoI = page.locator('[data-repo-name="repoI"]');
    await repoI.hover();
    await repoI.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoI"]')).toHaveCount(0);
  });

  test("the command log pane lists executed git commands", async ({ page }) => {
    await page.getByTestId("log-toggle").click();
    const pane = page.getByTestId("log-pane");
    await expect(pane).toBeVisible();

    await page.getByTestId("fetch").click();
    const entry = pane.getByTestId("log-entry").first();
    await expect(entry).toContainText("git -C");
    await expect(entry).toContainText("fetch --all --prune");

    await page.getByTestId("log-toggle").click();
    await expect(page.getByTestId("log-pane")).toHaveCount(0);
  });

  test("user actions appear in the log pane", async ({ page }) => {
    await page.getByTestId("log-toggle").click();
    const pane = page.getByTestId("log-pane");
    await expect(pane).toBeVisible();

    await page.getByTestId("reload").click();
    const action = pane.locator(".log-entry-action").first();
    await expect(action).toContainText("Reload repositories");

    // A fetch logs the interaction and, above it, the executed command.
    await page.getByTestId("fetch").click();
    await expect(pane.getByTestId("log-entry").first()).toContainText(
      "fetch --all --prune",
    );
    await expect(
      pane.locator(".log-entry-action").first(),
    ).toContainText("Fetch remotes");

    await page.getByTestId("log-toggle").click();
  });

  test("a branch with an open PR links to its GitHub page", async ({
    page,
  }) => {
    // PR data comes from the user's gh CLI on the server; stub the endpoint
    // and verify the badge wiring end to end.
    await page.route("**/api/prs", (route) =>
      route.fulfill({
        json: {
          prs: [
            {
              number: 7,
              url: "https://github.com/o/r/pull/7",
              branch: "feature",
            },
          ],
        },
      }),
    );
    await page.locator('[data-repo-name="repoA"]').click();

    const link = page.getByTestId("badge-pr");
    await expect(link).toHaveText("#7");
    await expect(link).toHaveAttribute(
      "href",
      "https://github.com/o/r/pull/7",
    );
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("diff lines can be selected, copied and permalinked", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("add-input").fill(fixtures.repoK);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoK"]')).toBeVisible();

    await page.getByTestId("commit-row").filter({ hasText: "k-2" }).click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "list.txt" })
      .click();
    await expect(page.getByTestId("diff-pane")).toBeVisible();
    await page.getByTestId("diff-view-inline").click();

    // k-2 inserted delta/epsilon as new lines 3-4; gamma follows as line 5.
    const lineNo = (no: number) =>
      page.locator('[data-testid="line-no"]', {
        hasText: new RegExp(`^${no}$`),
      });
    await lineNo(3).click();
    await lineNo(5).click({ modifiers: ["Shift"] });

    // A dropdown trigger appears on the first selected line, GitHub-style.
    const trigger = page.getByTestId("line-menu-trigger");
    await expect(trigger).toBeVisible();
    await expect(
      page
        .locator(".diff-line", { hasText: "delta" })
        .getByTestId("line-menu-trigger"),
    ).toBeVisible();

    await trigger.click();
    const menu = page.getByTestId("line-menu");
    await expect(menu).toContainText("3 lines");
    await menu.getByTestId("copy-lines").click();
    // The Windows clipboard round-trips LF as CRLF; normalize for comparison.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.replaceAll("\r\n", "\n")).toBe("delta\nepsilon\ngamma");
    // Copying closes the menu; the selection stays.
    await expect(menu).toHaveCount(0);

    await trigger.click();
    await page.getByTestId("copy-permalink").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /^https:\/\/github\.com\/example\/repoK\/blob\/[0-9a-f]{40}\/list\.txt#L3-L5$/,
    );

    // Escape clears the selection and the trigger with it.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("line-menu-trigger")).toHaveCount(0);

    // Restore the served set.
    const repoK = page.locator('[data-repo-name="repoK"]');
    await repoK.hover();
    await repoK.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoK"]')).toHaveCount(0);
  });

  test("the branch badge menu copies, checks out and merges", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("add-input").fill(fixtures.repoJ);
    await page.getByTestId("add-submit").click();
    await expect(page.locator('[data-tab-name="repoJ"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(3);

    const badge = (name: string) =>
      page.locator(".badge-ref", { hasText: name }).first();

    // Copy the branch name.
    await badge("topic").click({ button: "right" });
    await page.getByTestId("ref-menu-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "topic",
    );
    await expect(page.getByTestId("ref-menu")).toHaveCount(0);

    // Checkout topic: HEAD moves to the t-1 row.
    await badge("topic").click({ button: "right" });
    await page.getByTestId("ref-menu-checkout").click();
    await page.getByTestId("ref-menu-confirm").click();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({ hasText: "t-1" })
        .locator(".badge-head"),
      // The server broadcasts an update; the row re-renders with HEAD.
    ).toBeVisible({ timeout: 15_000 });

    // Merge main into topic: a merge commit appears on top.
    await badge("main").click({ button: "right" });
    await page.getByTestId("ref-menu-merge").click();
    await page.getByTestId("ref-menu-confirm").click();
    await expect(page.getByTestId("commit-row")).toHaveCount(4, {
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("commit-row").filter({ hasText: "Merge branch 'main'" }),
    ).toBeVisible();

    // Restore the served set (the on-disk mutation is repoJ-local).
    const repoJ = page.locator('[data-repo-name="repoJ"]');
    await repoJ.hover();
    await repoJ.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoJ"]')).toHaveCount(0);
  });

  test("merge commit messages are dimmed", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();

    const merge = page
      .getByTestId("commit-row")
      .filter({ hasText: "merge feature" });
    await expect(merge.locator(".commit-summary")).toHaveClass(
      /commit-summary-merge/,
    );

    const normal = page
      .getByTestId("commit-row")
      .filter({ hasText: "feature-1" });
    await expect(normal.locator(".commit-summary")).not.toHaveClass(
      /commit-summary-merge/,
    );
  });

  test("clicking the hash copies the full commit id", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator('[data-repo-name="repoA"]').click();

    const hash = page.getByTestId("commit-hash").first();
    const shown = (await hash.textContent()) ?? "";
    expect(shown).toMatch(/^[0-9a-f]{7}$/);

    await hash.click();
    await expect(hash).toHaveText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^[0-9a-f]{40}$/);
    expect(copied.startsWith(shown)).toBe(true);

    // The click copies; it must not toggle the row's detail panel.
    await expect(page.getByTestId("commit-detail")).toHaveCount(0);
    // The feedback is transient.
    await expect(hash).toHaveText(shown, { timeout: 3000 });
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
