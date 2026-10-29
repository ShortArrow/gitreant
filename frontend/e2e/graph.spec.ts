import { test, expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { commit, git } from "./git";

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
  repoL: string;
  repoM: string;
  repoN: string;
  repoO: string;
  repoP: string;
  repoQ: string;
  repoQWorktree: string;
  repoR: string;
  repoS: string;
  repoU: string;
  repoV: string;
  repoW: string;
  repoY: string;
  repoT: string;
};

/** Add the repository at `repoPath` through the drawer, opening its add
 * panel when it is closed. */
async function addRepo(page: Page, repoPath: string) {
  const input = page.getByTestId("add-input");
  if (!(await input.isVisible())) {
    await page.getByTestId("drawer-add").click();
  }
  await input.fill(repoPath);
  await input.press("Enter");
}

test.describe.serial("gitreant UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("drawer lists the served repositories", async ({ page }) => {
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
    await expect(page.locator('[data-repo-name="repoA"]')).toBeVisible();
    await expect(page.locator('[data-repo-name="repoB"]')).toBeVisible();
  });

  test("a row at the end of the list adds a repository", async ({ page }) => {
    const input = page.getByTestId("add-input");
    await expect(input).toHaveCount(0);
    await expect(page.getByTestId("add-submit")).toHaveCount(0);
    // The row ends the list, after the last repository, like a browser's
    // vertical tabs end with a new tab.
    const last = page.locator(".repo-list > li").last();
    await expect(last.getByTestId("drawer-add")).toContainText(
      "Add repository",
    );
    await expect(
      page.locator(".drawer-head [data-testid=drawer-add]"),
    ).toHaveCount(0);

    // Opening focuses the path field in the row's place; Escape closes it.
    await page.getByTestId("drawer-add").click();
    await expect(input).toBeFocused();
    await expect(last.getByTestId("add-input")).toHaveCount(1);
    await expect(page.getByTestId("add-browse")).toContainText(
      "Choose folder…",
    );
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);

    // A failed add keeps the panel open with the error; a good one closes it.
    await page.getByTestId("drawer-add").click();
    await input.fill(path.join(fixtures.repoC, "no-such-dir"));
    await input.press("Enter");
    await expect(page.locator(".drawer-error")).toBeVisible();
    await expect(input).toBeVisible();
    await input.fill(fixtures.repoC);
    await input.press("Enter");
    const repoC = page.locator('[data-repo-name="repoC"]');
    await expect(repoC).toBeVisible();
    await expect(input).toHaveCount(0);

    await repoC.hover();
    await repoC.getByTestId("repo-remove").click();
    await expect(repoC).toHaveCount(0);
  });

  test("repository rows are focusable buttons, not bare list items", async ({
    page,
  }) => {
    // A React onClick emits no onclick attribute, so a row carrying only a
    // handler is invisible to keyboard users and to hint extensions such as
    // Vimium — which would then offer the remove and disclosure buttons as
    // the only targets on the row. The role and tabindex are what expose it.
    const row = page.getByTestId("repo-item").first();
    await expect(row).toHaveAttribute("role", "button");
    await expect(row).toHaveAttribute("tabindex", "0");
    await row.focus();
    await expect(row).toBeFocused();
  });

  test("the page declares an icon and the server serves it", async ({
    page,
  }) => {
    // The tab and the app-mode window take their icon from these links.
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
      "href",
      "./favicon.svg",
    );
    const svg = await page.request.get("/favicon.svg");
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
    // The tab picks its size from the multi-frame .ico; the large PNG
    // serves app-mode windows and install prompts.
    const ico = await page.request.get("/favicon.ico");
    expect(ico.status()).toBe(200);
    expect(ico.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
    await expect(page.locator('link[rel="icon"][href="./favicon.ico"]')).toHaveAttribute(
      "sizes",
      /16x16.*256x256/,
    );
    const png = await page.request.get("/icon-512.png");
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toContain("image/png");
  });

  test("pane is empty until a repository is selected", async ({ page }) => {
    await expect(page.getByTestId("pane-empty")).toBeVisible();
    await expect(page.getByTestId("graph")).toHaveCount(0);
  });

  test("the drawer filters and sorts the repository list", async ({ page }) => {
    await expect(page.getByTestId("repo-item")).toHaveCount(2);

    // Filtering by a substring narrows the list; a miss shows the empty note.
    await page.getByTestId("repo-filter").fill("repoB");
    await expect(page.getByTestId("repo-item")).toHaveCount(1);
    await expect(page.locator('[data-repo-name="repoB"]')).toBeVisible();
    await page.getByTestId("repo-filter").fill("nothing-matches");
    await expect(page.getByTestId("repo-no-match")).toBeVisible();
    await page.getByTestId("repo-filter").fill("");
    await expect(page.getByTestId("repo-item")).toHaveCount(2);

    // Sorting by name orders the two served repositories alphabetically, and
    // the choice survives a reload.
    await page.getByTestId("repo-sort").selectOption("name");
    const names = () =>
      page.getByTestId("repo-item").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-repo-name")),
      );
    await expect.poll(names).toEqual(["repoA", "repoB"]);
    await page.reload();
    await expect(page.getByTestId("repo-sort")).toHaveValue("name");
    await page.getByTestId("repo-sort").selectOption("added");
  });

  test("the drawer shows a repository's uncommitted and unpushed counts", async ({
    page,
  }) => {
    // The fixtures are clean, so stub the per-repo status: repoA is dirty
    // and ahead, repoB is clean (no indicators).
    const list = (await (await page.request.get("/api/list")).json()) as {
      id: string;
      name: string;
    }[];
    const repoAId = list.find((r) => r.name === "repoA")!.id;
    await page.route("**/api/status", (route) => {
      const { repo } = route.request().postDataJSON();
      const body =
        repo === repoAId
          ? { dirty: 3, unpushed: 2, local_branches: 1 }
          : { dirty: 0, unpushed: 0, local_branches: 0 };
      route.fulfill({ json: body });
    });
    await page.reload();

    const repoA = page.locator('[data-repo-name="repoA"]');
    await expect(repoA.getByTestId("stat-dirty")).toHaveText(/3/);
    await expect(repoA.getByTestId("stat-unpushed")).toHaveText(/2/);
    await expect(repoA.getByTestId("stat-branch")).toHaveText(/1/);
    // A clean repository shows no indicators.
    await expect(
      page.locator('[data-repo-name="repoB"]').getByTestId("repo-status"),
    ).toHaveCount(0);
  });

  test("selecting repoA opens a tab and renders the graph", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();

    await expect(page.getByTestId("tab")).toHaveCount(1);
    await expect(page.locator('[data-tab-name="repoA"]')).toBeVisible();
    await expect(page.getByTestId("graph")).toBeVisible();

    // 5 commits -> 5 nodes and at least one edge.
    await expect(page.getByTestId("commit-row")).toHaveCount(5);
    // Each row shows its commit time at the right edge.
    await expect(page.getByTestId("commit-time").first()).toHaveText(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    await expect(page.getByTestId("graph-node")).toHaveCount(5);
    expect(
      await page.locator('[data-testid="graph"] path').count(),
    ).toBeGreaterThan(0);
  });

  test("merge history spans multiple lanes", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    // Count lanes only once the graph is drawn; the view read runs git
    // subprocesses and can land after the click returns.
    await expect(page.getByTestId("commit-row")).toHaveCount(5);
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
    // The summary stays one line; the tooltip carries it in full.
    const summary = panel.locator(".detail-summary");
    await expect(summary).toHaveAttribute("title", "main-1");
    await expect(summary).toHaveCSS("text-overflow", "ellipsis");
    await expect(summary).toHaveCSS("white-space", "nowrap");
    // The body hides behind the expander riding on the summary line, which
    // names its action in the tooltip.
    await expect(panel).not.toContainText("Second line of the description");
    const bodyToggle = panel.getByTestId("body-toggle");
    await expect(bodyToggle).toHaveAttribute("title", "Show full message");
    await bodyToggle.click();
    await expect(bodyToggle).toHaveAttribute("title", "Collapse the message");
    // A hard-wrapped paragraph rejoins into one flowing line of prose.
    await expect(panel.locator(".detail-message").first()).toHaveText(
      "Second line of the description wraps in the source.",
    );
    // Bullet lines render as a list, code blocks (indented or fenced) as
    // code — no raw markup. A hard-wrapped bullet keeps its continuation.
    const bullets = panel.getByTestId("detail-bullets").locator("li");
    await expect(bullets).toHaveCount(2);
    await expect(bullets.nth(1)).toHaveText(
      "second item that wraps onto a continuation line",
    );
    const codeBlocks = panel.getByTestId("detail-code");
    await expect(codeBlocks).toHaveCount(2);
    await expect(codeBlocks.nth(0)).toHaveText("make loady");
    await expect(codeBlocks.nth(1)).toHaveText("cargo test");
    await expect(panel).not.toContainText("```");
    await expect(panel).not.toContainText("- first item");
    await expect(panel).toContainText("Tester");

    // The expander only moves on explicit toggles: it survives switching
    // to another commit and back.
    await page.getByTestId("commit-row").filter({ hasText: "main-2" }).click();
    await page.getByTestId("commit-row").filter({ hasText: "main-1" }).click();
    await expect(panel).toContainText("Second line of the description");
    await panel.getByTestId("body-toggle").click();
    await expect(panel).not.toContainText("Second line of the description");
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

  test("the detail pane holds still when the selection changes", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const panel = page.getByTestId("commit-detail");
    const meta = panel.locator(".detail-meta");

    // main-1 carries a body, so it offers the expander; main-2 does not.
    await page.getByTestId("commit-row").filter({ hasText: "main-1" }).click();
    await expect(panel.getByTestId("body-toggle")).toBeVisible();
    const withBody = (await meta.boundingBox())!;

    await page.getByTestId("commit-row").filter({ hasText: "main-2" }).click();
    await expect(panel).toContainText("main-2");
    await expect(panel.getByTestId("body-toggle")).toHaveCount(0);
    const withoutBody = (await meta.boundingBox())!;

    // Whether the expander is offered must not move anything under it.
    expect(withoutBody.y).toBe(withBody.y);
  });

  test("commit details copy the parent, the email and both file paths", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("commit-row").filter({ hasText: "main-1" }).click();
    const panel = page.getByTestId("commit-detail");

    // A plain address names no account, so the author links to a user search.
    await expect(panel.getByTestId("detail-author")).toHaveAttribute(
      "href",
      "https://github.com/search?q=tester%40example.com&type=users",
    );
    await panel.getByTestId("detail-email").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "tester@example.com",
    );

    // Each parent chip copies the full id it abbreviates.
    const parent = panel.getByTestId("detail-parent").first();
    const shown = (await parent.textContent()) ?? "";
    expect(shown).toMatch(/^[0-9a-f]{7}$/);
    await parent.click();
    const parentId = await page.evaluate(() => navigator.clipboard.readText());
    expect(parentId).toMatch(/^[0-9a-f]{40}$/);
    expect(parentId.startsWith(shown)).toBe(true);

    const file = panel.getByTestId("detail-file").filter({ hasText: "README.md" });
    await file.click({ button: "right" });
    await page.getByTestId("file-copy-relative-path").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "README.md",
    );

    await file.click({ button: "right" });
    await page.getByTestId("file-copy-absolute-path").click();
    const absolute = await page.evaluate(() => navigator.clipboard.readText());
    expect(absolute).toMatch(/repoA[\\/]README\.md$/);
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
    // The hunk covers the whole two-line file: nothing is hidden around it.
    await expect(pane.getByTestId("diff-gap")).toHaveCount(0);
    await expect(pane.locator(".diff-line-add")).toContainText("+two");
    await expect(pane.locator(".diff-line-context")).toContainText(" one");
    await expect(page.getByTestId("graph")).toHaveCount(0);

    await page.getByTestId("diff-close").click();
    await expect(page.getByTestId("diff-pane")).toHaveCount(0);
    await expect(page.getByTestId("graph")).toBeVisible();
  });

  test("reveal a repo folder and open a changed file via the OS", async ({
    page,
  }) => {
    // Both actions hit /api/reveal; stub it so nothing actually launches,
    // and check the payloads.
    const reveals: Array<{ repo: string; path?: string }> = [];
    await page.route("**/api/reveal", async (route) => {
      reveals.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, body: "" });
    });

    // Drawer: "Reveal in file manager" opens the repository folder.
    await page.locator('[data-repo-name="repoA"]').click({ button: "right" });
    await page.getByTestId("drawer-reveal").click();
    await expect.poll(() => reveals.length).toBe(1);
    expect(reveals[0].path ?? null).toBeNull();
    expect(reveals[0].repo).toContain("repoA");

    // File list: "Open in editor" opens the repository-relative file.
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "README.md" })
      .click({ button: "right" });
    await page.getByTestId("file-open").click();
    await expect.poll(() => reveals.length).toBe(2);
    expect(reveals[1].path).toBe("README.md");
    expect(reveals[1].repo).toContain("repoA");
  });

  test("a file opens with an editor the configuration lists", async ({
    page,
  }) => {
    // Only the CLI or the user's hand writes the list; the page reads it.
    const config = path.join(process.cwd(), "e2e", ".tmp", "config");
    mkdirSync(config, { recursive: true });
    writeFileSync(
      path.join(config, "config.toml"),
      '[[editors]]\nname = "Probe"\nprogram = "git"\nargs = ["--version"]\n',
    );
    const write = await page.request.post("/api/editors", { data: [] });
    expect(write.status()).toBe(405);

    await page.getByTestId("settings-toggle").click();
    const editors = page.getByTestId("editors-setting");
    await expect(editors.getByTestId("editor-row")).toHaveText([
      "Probe: git --version",
    ]);
    await expect(editors).toContainText("config.toml");
    await expect(editors.locator("input")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The file's menu names the editor and asks by its place in the list.
    const opens: { repo: string; path: string; editor: number }[] = [];
    await page.route("**/api/open-with", async (route) => {
      opens.push(route.request().postDataJSON());
      await route.fulfill({ status: 200 });
    });
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("commit-row").filter({ hasText: "main-1" }).click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "README.md" })
      .click({ button: "right" });
    await expect(page.getByTestId("file-open-with-0")).toContainText("Probe");
    await page.getByTestId("file-open-with-0").click();
    await expect.poll(() => opens.length).toBe(1);
    expect(opens[0]).toMatchObject({ path: "README.md", editor: 0 });
    await page.unroute("**/api/open-with");

    // The server runs the editor's program with its arguments.
    const ran = await page.request.post("/api/open-with", {
      data: { repo: opens[0].repo, path: "README.md", editor: 0 },
    });
    expect(ran.status()).toBe(200);
    // A path out of the repository is refused.
    const outside = await page.request.post("/api/open-with", {
      data: { repo: opens[0].repo, path: "../README.md", editor: 0 },
    });
    expect(outside.status()).toBe(400);

    rmSync(path.join(config, "config.toml"));
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
    await addRepo(page, fixtures.repoE);
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
    await addRepo(page, fixtures.repoD);
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

  test("the diff-all button toggles the whole commit diff", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-2" })
      .click();
    const diffAll = page.getByTestId("diff-all");
    const sections = page.getByTestId("diff-file-section");
    await expect(diffAll).toHaveAttribute("aria-pressed", "false");

    // From one file's diff, the button switches to every file's diff.
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "one.ts" })
      .click();
    await expect(sections).toHaveCount(1);
    await diffAll.click();
    await expect(sections).toHaveCount(2);
    await expect(diffAll).toHaveAttribute("aria-pressed", "true");

    // Pressed again, it closes the diff and brings the graph back.
    await diffAll.click();
    await expect(page.getByTestId("diff-pane")).toHaveCount(0);
    await expect(page.getByTestId("graph")).toBeVisible();
    await expect(diffAll).toHaveAttribute("aria-pressed", "false");
  });

  test("fetch button pulls new remote commits into the graph", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoF);
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

    // After a fetch, tags known on origin carry the remote segment while
    // local-only ones stay plain.
    const remoteTag = page.locator(".badge-kind-tag", { hasText: "vremote" });
    await expect(remoteTag.getByTestId("badge-remote")).toHaveText("origin");
    const localTag = page.locator(".badge-kind-tag", { hasText: "vlocal" });
    await expect(localTag.getByTestId("badge-remote")).toHaveCount(0);

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
          .filter(
            (e) =>
              !e.closest(".thickness") &&
              (e.getAttribute("d") ?? "").includes("C"),
          )
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
    await addRepo(page, fixtures.repoD);
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

  test("each row counts the lines its commit added and deleted", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const stat = (summary: string) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) })
        .getByTestId("commit-stat");
    // Counted after the view answers, then filled in (ADR 0041).
    await expect(stat("main-2")).toHaveText("+2 −0");
    await expect(stat("root")).toHaveText("+1 −0");
    // A merge counts against its first parent: the empty feature-1 brought
    // nothing in.
    await expect(stat("merge feature")).toHaveText("+0 −0");
    await expect(stat("main-2")).toHaveAttribute(
      "title",
      "Lines added: 2, deleted: 0",
    );
  });

  test("each counted commit stands thick with the lines it changed", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const stat = (summary: string) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) })
        .getByTestId("commit-stat");
    await expect(stat("main-2")).toHaveText("+2 −0");
    await expect(stat("root")).toHaveText("+1 −0");

    // root, main-1 and main-2 added lines; the empty feature-1 and the
    // merge that brought it in did not (ADR 0044).
    const thick = page.getByTestId("thickness-node");
    await expect(thick).toHaveCount(3);
    await expect(thick.and(page.locator('[data-side="deleted"]'))).toHaveCount(
      0,
    );
    // Added lines stack up and to the left, far end first.
    const copies = thick.first().locator("circle");
    const far = (await copies.first().boundingBox())!;
    const near = (await copies.last().boundingBox())!;
    expect(far.x).toBeLessThan(near.x);
    expect(far.y).toBeLessThan(near.y);
    // A fin is as wide as a pillar, so both reach as high.
    const fin = page
      .locator('.thickness-side[data-side="added"] path')
      .first();
    expect(Number(await fin.getAttribute("stroke-width"))).toBe(
      2 * Number(await copies.first().getAttribute("r")),
    );
    // Each lane merges into one shape, the leftmost drawn first so the
    // rightmost stands in front.
    const lanes = page.locator(
      '.thickness-side[data-side="added"] > .thickness-lane',
    );
    const order = await lanes.evaluateAll((groups) =>
      groups.map((g) => Number(g.getAttribute("data-lane"))),
    );
    expect(order.length).toBeGreaterThan(0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Fins are fainter than the pillars, merged into one shape per lane.
    const fins = lanes.first().locator(".thickness-fins");
    await expect(fins).toHaveCount(1);
    expect(
      Number(await fins.evaluate((g) => getComputedStyle(g).opacity)),
    ).toBeLessThan(1);
    // Green, see-through, and not the lane's color.
    const look = await lanes.first().evaluate((g) => {
      const body = g.querySelector(".thickness-body")!;
      const path = g.querySelector("path")!;
      return {
        opacity: Number(getComputedStyle(body).opacity),
        filter: getComputedStyle(g).filter,
        color: getComputedStyle(g).color,
        stroke: getComputedStyle(path).stroke,
      };
    });
    expect(look.opacity).toBeLessThan(1);
    expect(look.stroke).toBe(look.color);
    // The outline is a setting, off at first.
    const outline = () =>
      lanes.first().evaluate((g) => getComputedStyle(g).filter);
    expect(await outline()).toBe("none");
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("thickness-outline-toggle").check();
    await page.keyboard.press("Escape");
    await expect.poll(outline).not.toBe("none");
    const success = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--success)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(look.color).toBe(success);
    // The deleted side is drawn first, behind the edges, and the added side
    // last, in front of the nodes.
    const depth = (side: string) =>
      page.locator(`.thickness-side[data-side="${side}"]`).evaluate((g) => {
        const thickness = g.parentElement!;
        const graph = thickness.parentElement!;
        return [
          graph.firstElementChild === thickness,
          graph.lastElementChild === thickness,
        ];
      });
    expect(await depth("deleted")).toEqual([true, false]);
    expect(await depth("added")).toEqual([false, true]);
    // In front of the nodes, it still leaves them to the pointer.
    await page.getByTestId("graph-node").first().hover();
    await expect(page.getByTestId("node-tip")).toBeVisible();

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("thickness-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(thick).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("thickness-toggle").check();
    await page.keyboard.press("Escape");
    await expect(thick).toHaveCount(3);
  });

  test("a setting draws the line counts as bars", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const stat = (summary: string) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) })
        .getByTestId("commit-stat");
    await expect(stat("main-2")).toHaveText("+2 −0");
    await expect(stat("root")).toHaveText("+1 −0");

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("line-counts-bars").check();
    await page.keyboard.press("Escape");

    // Bars in place of the numbers, which stay in the tooltip (ADR 0046).
    await expect(stat("main-2")).toHaveText("");
    await expect(stat("main-2")).toHaveAttribute(
      "title",
      "Lines added: 2, deleted: 0",
    );
    // The thickness's scale: 3 × log2(1 + lines) pixels.
    const width = async (summary: string, side: string) =>
      (await stat(summary).locator(`.stat-bar-${side}`).boundingBox())
        ?.width ?? 0;
    expect(await width("main-2", "added")).toBeCloseTo(3 * Math.log2(3), 0);
    expect(await width("root", "added")).toBeCloseTo(3, 0);
    expect(await width("main-2", "deleted")).toBe(0);
    // As tall as the row.
    const rowBox = (await page
      .getByTestId("commit-row")
      .filter({ has: page.locator(".commit-summary", { hasText: "main-2" }) })
      .boundingBox())!;
    const barBox = (await stat("main-2")
      .locator(".stat-bar-added")
      .boundingBox())!;
    expect(barBox.height).toBeGreaterThanOrEqual(rowBox.height - 2);
    // At the start of the row, so every row's axis lines up, whatever its
    // badges or author.
    const axis = async (summary: string) =>
      (await stat(summary).locator(".stat-axis").boundingBox())!.x;
    expect(await axis("root")).toBeCloseTo(await axis("merge feature"), 0);
    const summaryBox = (await page
      .locator(".commit-summary", { hasText: "merge feature" })
      .boundingBox())!;
    expect(await axis("merge feature")).toBeLessThan(summaryBox.x);

    // The choice is kept.
    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(stat("main-2").locator(".stat-axis")).toHaveCount(1);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("line-counts-numbers").check();
    await page.keyboard.press("Escape");
    await expect(stat("main-2")).toHaveText("+2 −0");
  });

  test("a setting leaves the line counts out of the rows (ADR 0052)", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const row = (summary: string) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) });
    await expect(row("main-2").getByTestId("commit-stat")).toHaveText("+2 −0");
    const summaryX = async () =>
      (await row("main-2").locator(".commit-summary").boundingBox())!.x;
    const withNumbers = await summaryX();

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("line-counts-none").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("commit-stat")).toHaveCount(0);
    expect(await summaryX()).toBeCloseTo(withNumbers, 0);

    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(row("main-2")).toBeVisible();
    await expect(page.getByTestId("commit-stat")).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("line-counts-numbers").check();
    await page.keyboard.press("Escape");
    await expect(row("main-2").getByTestId("commit-stat")).toHaveText("+2 −0");
  });

  test("the cumulative chart sums the lines along HEAD's first parents", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const stat = (summary: string) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) })
        .getByTestId("commit-stat");
    await expect(stat("root")).toHaveText("+1 −0");
    await expect(stat("merge feature")).toHaveText("+0 −0");

    // The chart takes the place of the rows and their graph (ADR 0043).
    const toggle = page.getByTestId("cumulative-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    // Like the pane's other toggles: no fill, muted until pressed.
    const look = await toggle.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--muted)";
      document.body.append(probe);
      const muted = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color, muted };
    });
    expect(look.background).toBe("rgba(0, 0, 0, 0)");
    expect(look.color).toBe(look.muted);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("commit-row")).toHaveCount(0);
    await expect(page.getByTestId("graph")).toHaveCount(0);
    const chart = page.getByTestId("cumulative-chart");
    await expect(chart).toBeVisible();
    await expect(page.getByTestId("chart-counting")).toHaveCount(0);
    // A legend names each line in its own color.
    const legend = page.getByTestId("chart-legend").locator("li");
    await expect(legend).toHaveText([
      "Added",
      "Deleted",
      "Net",
      "Candles",
      "Bars",
    ]);
    const colorOf = (selector: string) =>
      chart
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).stroke);
    const swatch = (i: number) =>
      legend
        .nth(i)
        .locator(".chart-swatch")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await swatch(0)).toBe(await colorOf(".chart-added"));
    expect(await swatch(1)).toBe(await colorOf(".chart-deleted"));
    expect(await swatch(2)).toBe(await colorOf(".chart-net"));

    // root, main-1, main-2 and the merge: feature-1 counts in the merge.
    const box = (await chart.boundingBox())!;
    const tip = page.getByTestId("chart-tip");
    await page.mouse.move(box.x + box.width - 16, box.y + box.height / 2);
    await expect(tip).toContainText("merge feature");
    await expect(tip).toContainText("added 4, deleted 0, net 4");
    // The tip sits beside the cursor's line: left of it near the right end,
    // right of it near the left end, never across it.
    const cursorX = async () =>
      (await chart.locator(".chart-cursor").boundingBox())!.x;
    let tipBox = (await tip.boundingBox())!;
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(await cursorX());
    expect(tipBox.x + tipBox.width).toBeGreaterThan((await cursorX()) - 24);
    await page.mouse.move(box.x + 56, box.y + box.height / 2);
    await expect(tip).toContainText("root");
    await expect(tip).toContainText("added 1, deleted 0, net 1");
    tipBox = (await tip.boundingBox())!;
    expect(tipBox.x).toBeGreaterThanOrEqual(await cursorX());
    expect(tipBox.x).toBeLessThan((await cursorX()) + 24);

    await toggle.click();
    await expect(page.getByTestId("commit-row")).not.toHaveCount(0);
  });

  test("the chart adds candles and each period's bars, each turned on and off in the legend", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({
          has: page.locator(".commit-summary", { hasText: "merge feature" }),
        })
        .getByTestId("commit-stat"),
    ).toHaveText("+0 −0");
    await page.getByTestId("cumulative-toggle").click();
    const chart = page.getByTestId("cumulative-chart");

    // Every series shows at first: candles sit on the net line (ADR 0047).
    await expect(chart.locator(".chart-net")).toHaveCount(1);
    // repoA's commits fall on one day: one candle, rising from 0 to 4, and
    // one day's bars.
    const candle = chart.locator(".chart-candle");
    await expect(candle).toHaveCount(1);
    await expect(candle).toHaveClass(/chart-candle-up/);
    await expect(chart.locator(".chart-bar-added")).toHaveCount(1);
    await expect(chart.locator(".chart-bar-deleted")).toHaveCount(1);
    const box = (await candle.locator("rect").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = page.getByTestId("chart-tip");
    await expect(tip).toContainText("open 0, high 4, low 0, close 4");
    await expect(tip).toContainText("in the period: added 4, deleted 0");

    // Pressing a name hides its series and fades the name.
    const series = (name: string) => page.getByTestId(`chart-series-${name}`);
    await expect(series("net")).toHaveAttribute("aria-pressed", "true");
    await series("net").click();
    await expect(series("net")).toHaveAttribute("aria-pressed", "false");
    await expect(chart.locator(".chart-net")).toHaveCount(0);
    await expect(candle).toHaveCount(1);
    await series("candles").click();
    await expect(candle).toHaveCount(0);
    await series("bars").click();
    await expect(chart.locator(".chart-bar-added")).toHaveCount(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tip).not.toContainText("open");
    await expect(tip).not.toContainText("in the period");
    await series("added").click();
    await expect(chart.locator(".chart-added")).toHaveCount(0);
    await series("net").click();
    await expect(chart.locator(".chart-net")).toHaveCount(1);
  });

  test("the calendar under the rows shades each day and walks its commits", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({
          has: page.locator(".commit-summary", { hasText: "merge feature" }),
        })
        .getByTestId("commit-stat"),
    ).toHaveText("+0 −0");
    await page.getByTestId("calendar-toggle").click();
    const calendar = page.getByTestId("calendar");
    // A strip under the rows, which stay (ADR 0050).
    await expect(calendar).toBeVisible();
    await expect(page.getByTestId("commit-row").first()).toBeVisible();

    // repoA's commits fall on one day: one week, one shaded day.
    await expect(calendar.locator(".calendar-week")).toHaveCount(1);
    const day = calendar.getByTestId("calendar-day");
    await expect(day).toHaveCount(1);
    await day.hover();
    // Every commit but the merge, on main and on feature.
    const tip = page.getByTestId("calendar-tip");
    await expect(tip).toContainText("4 commits");
    await expect(tip).toContainText("+4 −0");

    // Clicking the day selects its newest commit, then each older one, and
    // round to the newest again.
    const selected = page.locator(".commits .commit.selected");
    for (const summary of ["main-2", "feature-1", "main-1", "root", "main-2"]) {
      await day.click();
      await expect(selected).toContainText(summary);
    }
    await expect(day).toHaveClass(/selected/);

    // From the chart, the day goes back to the rows.
    await page.getByTestId("cumulative-toggle").click();
    await expect(page.getByTestId("cumulative-chart")).toBeVisible();
    await day.click();
    await expect(page.getByTestId("cumulative-chart")).toHaveCount(0);
    await expect(selected).toContainText("feature-1");

    await page.getByTestId("calendar-toggle").click();
    await expect(calendar).toHaveCount(0);
  });

  test("a setting starts the calendar's weeks on Sunday", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("calendar-toggle").click();
    const calendar = page.getByTestId("calendar");
    const row = async () =>
      Number(await calendar.getByTestId("calendar-day").getAttribute("y"));
    const weekdays = calendar.locator(".calendar-weekday");
    await expect(weekdays).toHaveText(["Mon", "Wed", "Fri"]);
    const mondayFirst = await row();

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("week-start-sunday").click();
    await page.keyboard.press("Escape");
    // The day moves one row down, or from the bottom row to the top.
    const pitch = 14;
    const expected = mondayFirst === 16 + 6 * pitch ? 16 : mondayFirst + pitch;
    await expect.poll(row).toBe(expected);
    await expect(weekdays).toHaveText(["Mon", "Wed", "Fri"]);

    // The choice survives a reload.
    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("calendar-toggle").click();
    await expect.poll(row).toBe(expected);
    await page.getByTestId("calendar-toggle").click();
  });

  test("the calendar shades by added lines, deleted lines or both", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({
          has: page.locator(".commit-summary", { hasText: "merge feature" }),
        })
        .getByTestId("commit-stat"),
    ).toHaveText("+0 −0");
    await page.getByTestId("calendar-toggle").click();
    const day = page.getByTestId("calendar-day");
    const shading = (name: string) => page.getByTestId(`shading-${name}`);

    // Both at first; repoA's day only added lines (ADR 0050).
    await expect(shading("both")).toBeChecked();
    await expect(day).not.toHaveClass(/blank/);
    await shading("deleted").check();
    await expect(day).toHaveClass(/blank/);
    await shading("added").check();
    await expect(day).not.toHaveClass(/blank/);
  });

  test("the calendar's shading buttons follow the button style", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("calendar-toggle").click();
    const added = page.getByTestId("shading-added").locator("..");
    const style = async (name: string) => {
      await page.getByTestId("settings-toggle").click();
      await page.getByTestId(`button-style-${name}`).click();
      await page.keyboard.press("Escape");
    };

    // Icon with label by default.
    await expect(added.locator("svg")).toHaveCount(1);
    await expect(added).toContainText("Added");

    // The icon alone keeps the label as the tooltip.
    await style("icon");
    await expect(added.locator("svg")).toHaveCount(1);
    await expect(added).not.toContainText("Added");
    await expect(added).toHaveAttribute("title", "Added");

    await style("label");
    await expect(added.locator("svg")).toHaveCount(0);
    await expect(added).toContainText("Added");
  });

  test("scrolling the calendar to its oldest end reads older pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.addInitScript(() =>
      localStorage.setItem("gitreant-page-size", "60"),
    );
    await page.reload();
    await addRepo(page, fixtures.repoY);
    await page.locator('[data-repo-name="repoY"]').click();
    await page.getByTestId("calendar-toggle").click();
    const weeks = page.getByTestId("calendar").locator(".calendar-week");
    const scroll = page.locator(".calendar-scroll");

    // A commit a week: the first pages hold some of the four years, and the
    // calendar opens at its newest end.
    await expect(weeks.first()).toBeAttached();
    const before = await weeks.count();
    expect(before).toBeLessThan(208);
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    // The weekday names stay put while the weeks scroll under them.
    const monday = page.locator(".calendar-weekday").first();
    const at = (await monday.boundingBox())!.x;
    await scroll.evaluate((el) => {
      el.scrollLeft -= 100;
    });
    await expect.poll(async () => (await monday.boundingBox())!.x).toBe(at);

    // Reaching the oldest end reads on, and the weeks already there stay in
    // view rather than jumping.
    await scroll.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect.poll(() => weeks.count()).toBeGreaterThan(before);
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    // Scrolling back again and again reads every page, then stops offering
    // more.
    await expect
      .poll(
        async () => {
          await scroll.evaluate((el) => {
            el.scrollLeft = 0;
          });
          return weeks.count();
        },
        { timeout: 20_000 },
      )
      .toBe(208);
    await expect(page.getByTestId("calendar-older")).toHaveCount(0);

    const repoY = page.locator('[data-repo-name="repoY"]');
    await repoY.hover();
    await repoY.getByTestId("repo-remove").click();
    await expect(repoY).toHaveCount(0);
  });

  test("the range narrows the chart, and quarters and years cut it", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoY);
    await page.locator('[data-repo-name="repoY"]').click();
    await expect(page.getByTestId("commit-row")).toHaveCount(208);
    await page.getByTestId("cumulative-toggle").click();
    const candle = page
      .getByTestId("cumulative-chart")
      .locator(".chart-candle");
    const range = (name: string) => page.getByTestId(`range-${name}`);
    const timeframe = (name: string) => page.getByTestId(`timeframe-${name}`);

    // A commit a week for four years, from September 2020 (ADR 0051).
    await expect(range("all")).toBeChecked();
    await timeframe("week").check();
    await expect(candle).toHaveCount(208);
    await timeframe("quarter").check();
    await expect(candle).toHaveCount(17);
    await timeframe("year").check();
    await expect(candle).toHaveCount(5);

    // The last year alone: its 53 Sundays.
    await range("1y").check();
    await timeframe("week").check();
    await expect(candle).toHaveCount(53);
    await range("all").check();
    await expect(candle).toHaveCount(208);

    const repoY = page.locator('[data-repo-name="repoY"]');
    await repoY.hover();
    await repoY.getByTestId("repo-remove").click();
    await expect(repoY).toHaveCount(0);
  });

  test("the timeframe cuts the candles and bars by commit, day, week or month", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("cumulative-toggle").click();
    const chart = page.getByTestId("cumulative-chart");
    const candle = chart.locator(".chart-candle");
    const bars = chart.locator(".chart-bar-added");
    const timeframe = (name: string) => page.getByTestId(`timeframe-${name}`);

    // Auto at first: repoA's commits fall on one day (ADR 0049).
    await expect(timeframe("auto")).toBeChecked();
    await expect(candle).toHaveCount(1);

    // Its four first parents, seconds apart, each get a column of their own.
    await timeframe("commit").check();
    await expect(candle).toHaveCount(4);
    await expect(bars).toHaveCount(4);

    await timeframe("week").check();
    await expect(candle).toHaveCount(1);
    await expect(bars).toHaveCount(1);
  });

  test("clicking the chart lists the commits under the cursor, each a way back to its row", async ({
    page,
  }) => {
    // Narrow enough that the list leaves the chart less room than its head
    // takes on one line.
    await page.setViewportSize({ width: 820, height: 720 });
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({
          has: page.locator(".commit-summary", { hasText: "merge feature" }),
        })
        .getByTestId("commit-stat"),
    ).toHaveText("+0 −0");
    await page.getByTestId("cumulative-toggle").click();
    const chart = page.getByTestId("cumulative-chart");
    const list = page.getByTestId("chart-list");
    const listed = list.getByTestId("listed-commit");
    // repoA's first parents are root, main-1, main-2 and the merge, at 0,
    // 10, 30 and 40 seconds: main-1 is drawn a quarter across the plot,
    // whose margins are 56 and 16 pixels.
    const clickMain1 = async () => {
      const box = (await chart.boundingBox())!;
      const x = box.x + 56 + (box.width - 72) / 4;
      await page.mouse.click(x, box.y + box.height / 2);
    };

    // Only the commit under the cursor is listed, not the rest of its day
    // (ADR 0048).
    await clickMain1();
    await expect(listed.locator(".listed-commit-summary")).toHaveText([
      "main-1",
    ]);
    await expect(list.locator(".chart-list-count")).toHaveText("1 commit");
    await expect(listed).toContainText("+1 −0");
    // The chart's head stays inside the room the list leaves it.
    const month = (await page.getByTestId("timeframe-month").boundingBox())!;
    const panel = (await list.boundingBox())!;
    expect(month.x + month.width).toBeLessThanOrEqual(panel.x);

    // Esc closes the menu first, then the list.
    await listed.click({ button: "right" });
    await expect(page.getByTestId("commit-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("commit-menu")).toHaveCount(0);
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);

    // The × closes it too.
    await clickMain1();
    await expect(list).toBeVisible();
    await page.getByTestId("chart-list-close").click();
    await expect(list).toHaveCount(0);

    // "Show in rows" closes the chart and selects the commit there.
    await clickMain1();
    await listed.click({ button: "right" });
    await page.getByTestId("commit-menu-show-in-rows").click();
    await expect(chart).toHaveCount(0);
    await expect(page.locator(".commits .commit.selected")).toContainText(
      "main-1",
    );
  });

  test("dragging the graph's background tilts its thickness", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const thick = page.getByTestId("thickness-node");
    await expect(thick).toHaveCount(3);
    const graph = page.getByTestId("graph");
    const box = (await graph.boundingBox())!;
    // The background right of the lanes, inside the room kept for the
    // thickness (ADR 0045).
    const x = box.x + box.width - 4;
    const y = box.y + box.height / 2;
    expect(
      await page.evaluate(
        ([px, py]) => document.elementFromPoint(px, py)?.tagName,
        [x, y],
      ),
    ).toBe("svg");
    const lean = async () => {
      const copies = thick.first().locator("circle");
      const far = (await copies.first().boundingBox())!;
      const near = (await copies.last().boundingBox())!;
      return { dx: far.x - near.x, dy: far.y - near.y };
    };
    const start = await lean();
    expect(start.dx).toBeLessThan(0);
    expect(start.dy).toBeLessThan(0);

    // A quarter turn clockwise: from up and to the left to up and right,
    // for as long as the button is held.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 180, y, { steps: 4 });
    const turned = await lean();
    expect(turned.dx).toBeGreaterThan(0);
    expect(turned.dy).toBeLessThan(0);

    // Down flattens it to nothing, as seen from straight above.
    await page.mouse.move(x + 180, y + 200, { steps: 4 });
    await expect(thick).toHaveCount(0);

    // Letting go returns to the start.
    await page.mouse.up();
    await expect(thick).toHaveCount(3);
    const reset = await lean();
    expect(reset.dx).toBeCloseTo(start.dx, 0);
    expect(reset.dy).toBeCloseTo(start.dy, 0);
  });

  test("a selection on the page does not stop the tilt", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const thick = page.getByTestId("thickness-node");
    await expect(thick).toHaveCount(3);
    const box = (await page.getByTestId("graph").boundingBox())!;
    const x = box.x + box.width - 4;
    const y = box.y + box.height / 2;
    // Text selected across the page: pressing inside it would otherwise
    // start the browser's own drag of the selection.
    await page.evaluate(() =>
      document.getSelection()!.selectAllChildren(document.body),
    );
    const lean = async () => {
      const copies = thick.first().locator("circle");
      const far = (await copies.first().boundingBox())!;
      const near = (await copies.last().boundingBox())!;
      return far.x - near.x;
    };
    expect(await lean()).toBeLessThan(0);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 180, y, { steps: 4 });
    expect(await lean()).toBeGreaterThan(0);
    await page.mouse.up();
  });

  test("only the rows near the view are drawn thick", async ({ page }) => {
    // Drawing every row's thickness made a long history too slow to tilt.
    await addRepo(page, fixtures.repoW);
    await page.locator('[data-repo-name="repoW"]').click();
    const stat = (summary: RegExp) =>
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".commit-summary", { hasText: summary }) })
        .getByTestId("commit-stat");
    await expect(stat(/^w-150$/)).toHaveText("+1 −0");
    await expect(stat(/^w-1$/)).toHaveText("+1 −0");
    // w-150 is main; w-1, its root, is main~149.
    const thick = (rev: string) =>
      page.locator(
        `[data-testid="thickness-node"][data-commit="${execFileSync(
          "git",
          ["rev-parse", rev],
          { cwd: fixtures.repoW, encoding: "utf8" },
        ).trim()}"]`,
      );
    const drawn = page.getByTestId("thickness-node");
    await expect(thick("main")).toHaveCount(1);
    await expect(thick("main~149")).toHaveCount(0);
    expect(await drawn.count()).toBeLessThan(150);

    await page.getByTestId("graph-scroll").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(thick("main~149")).toHaveCount(1);
    await expect(thick("main")).toHaveCount(0);

    const repoW = page.locator('[data-repo-name="repoW"]');
    await repoW.hover();
    await repoW.getByTestId("repo-remove").click();
    await expect(repoW).toHaveCount(0);
  });

  test("counts finished before the event stream connects still show", async ({
    page,
  }) => {
    // Hold the event stream back, so the view is read, counted and
    // announced before the page is listening (ADR 0041).
    await page.route("**/api/events", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.reload();
    await addRepo(page, fixtures.repoU);
    await expect(page.locator('[data-tab-name="repoU"]')).toBeVisible();
    await expect(page.getByTestId("commit-stat")).toHaveText("+3 −0");

    await page.unroute("**/api/events");
    const repoU = page.locator('[data-repo-name="repoU"]');
    await repoU.hover();
    await repoU.getByTestId("repo-remove").click();
    await expect(repoU).toHaveCount(0);
  });

  test("a view answered late does not undo a newer one", async ({ page }) => {
    // Hold back the answer to the read that starts the count, until the
    // read its `counted` event brings has answered (ADR 0041).
    let held = false;
    await page.route("**/api/view", async (route) => {
      const response = await route.fetch();
      const view = await response.json();
      if (view.name === "repoV" && !held) {
        held = true;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.fulfill({ response, json: view });
    });
    await addRepo(page, fixtures.repoV);
    await expect(page.locator('[data-tab-name="repoV"]')).toBeVisible();
    const stat = page.getByTestId("commit-stat");
    await expect(stat).toHaveText("+2 −0");
    await page.waitForTimeout(2000);
    await expect(stat).toHaveText("+2 −0");

    await page.unroute("**/api/view");
    const repoV = page.locator('[data-repo-name="repoV"]');
    await repoV.hover();
    await repoV.getByTestId("repo-remove").click();
    await expect(repoV).toHaveCount(0);
  });

  test("a node's tooltip outlasts a reload that keeps the node", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const node = page.getByTestId("graph-node").first();
    await node.hover();
    const tip = page.getByTestId("node-tip");
    await expect(tip).toBeVisible();
    const label = await tip.textContent();

    // A reload the pointer did not cause, as a batch of counts or
    // verdicts arriving brings (ADR 0037, ADR 0041).
    const reread = page.waitForResponse((r) => r.url().endsWith("/api/view"));
    await page.request.post("/api/refresh");
    await reread;
    await page.waitForTimeout(200);
    await expect(tip).toHaveText(label!);
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
  });

  test("closing a tab empties the pane", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.getByTestId("tab")).toHaveCount(1);

    await page.getByTestId("tab-close").first().click();
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect(page.getByTestId("pane-empty")).toBeVisible();
  });

  test("closing tabs moves focus to the last remaining tab", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click();
    await expect(page.locator('[data-tab-name="repoB"]')).toHaveClass(
      /active/,
    );

    // Closing the active tab activates the rightmost remaining one.
    await page
      .locator('[data-tab-name="repoB"]')
      .getByTestId("tab-close")
      .click();
    await expect(page.locator('[data-tab-name="repoA"]')).toHaveClass(
      /active/,
    );
    await expect(page.locator(".repo-header h2")).toHaveText("repoA");

    // Closing an inactive tab leaves the shown pane alone.
    await page.locator('[data-repo-name="repoB"]').click();
    await page
      .locator('[data-tab-name="repoA"]')
      .getByTestId("tab-close")
      .click();
    await expect(page.locator('[data-tab-name="repoB"]')).toHaveClass(
      /active/,
    );
    await expect(page.locator(".repo-header h2")).toHaveText("repoB");
  });

  test("a middle click closes a tab", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click();

    // An inactive tab closes without being shown first.
    await page.locator('[data-tab-name="repoA"]').click({ button: "middle" });
    await expect(page.locator('[data-tab-name="repoA"]')).toHaveCount(0);
    await expect(page.locator('[data-tab-name="repoB"]')).toHaveClass(/active/);
    await expect(page.locator(".repo-header h2")).toHaveText("repoB");

    await page.locator('[data-tab-name="repoB"]').click({ button: "middle" });
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect(page.getByTestId("pane-empty")).toBeVisible();
  });

  test("reopening an open repository focuses its tab without duplicating", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click();
    await expect(page.getByTestId("tab")).toHaveCount(2);

    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.getByTestId("tab")).toHaveCount(2);
    await expect(page.locator('[data-tab-name="repoA"]')).toHaveClass(
      /active/,
    );
    await expect(page.locator(".repo-header h2")).toHaveText("repoA");
  });

  test("switching tabs resets the commit selection", async ({ page }) => {
    // The card remounts per tab, so the detail panel does not survive a
    // switch. A pane-split layout may revisit this; today it is the rule.
    await page.locator('[data-repo-name="repoA"]').click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "main-1" })
      .click();
    await expect(page.getByTestId("commit-detail")).toBeVisible();

    await page.locator('[data-repo-name="repoB"]').click();
    await page.locator('[data-tab-name="repoA"]').click();
    await expect(page.getByTestId("commit-detail")).toHaveCount(0);
  });

  test("a tab moves to the right pane and back via its context menu", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click();

    const tabB = page.locator('[data-tab-name="repoB"]');
    await tabB.click({ button: "right" });
    // The menu opens right at the cursor (the tab center), like every
    // other context menu — not somewhere down in document flow.
    const tabBox = (await tabB.boundingBox())!;
    const menuBox = (await page.getByTestId("context-menu").boundingBox())!;
    expect(Math.abs(menuBox.x - (tabBox.x + tabBox.width / 2))).toBeLessThan(
      12,
    );
    expect(Math.abs(menuBox.y - (tabBox.y + tabBox.height / 2))).toBeLessThan(
      12,
    );
    await page.getByTestId("tab-open-right").click();
    const slots = page.getByTestId("pane-slot");
    await expect(slots).toHaveCount(2);
    await expect(slots.nth(0).locator(".repo-header h2")).toHaveText("repoA");
    await expect(slots.nth(1).locator(".repo-header h2")).toHaveText("repoB");

    // Moving it back to the left collapses the split.
    await page.locator('[data-tab-name="repoB"]').click({ button: "right" });
    await page.getByTestId("tab-move-left").click();
    await expect(slots).toHaveCount(1);
    await expect(page.locator(".repo-header h2")).toHaveText("repoB");
  });

  test("the drawer and the palette open a repository in the right pane", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();

    await page.locator('[data-repo-name="repoB"]').click({ button: "right" });
    await page.getByTestId("drawer-open-right").click();
    const slots = page.getByTestId("pane-slot");
    await expect(slots).toHaveCount(2);
    await expect(slots.nth(1).locator(".repo-header h2")).toHaveText("repoB");

    // Closing the right pane's last tab collapses the split.
    await slots.nth(1).getByTestId("tab-close").click();
    await expect(slots).toHaveCount(1);

    // The palette route does the same.
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("right pane");
    await page
      .getByTestId("palette-item")
      .filter({ hasText: "repoB" })
      .click();
    await expect(slots).toHaveCount(2);
    await expect(slots.nth(1).locator(".repo-header h2")).toHaveText("repoB");
  });

  test("repository commands come from the focused pane", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click({ button: "right" });
    await page.getByTestId("drawer-open-right").click();
    const slots = page.getByTestId("pane-slot");
    await expect(slots).toHaveCount(2);

    // The freshly split right pane (repoB) holds the focus: the palette
    // offers its branch, not repoA's.
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("checkout");
    await expect(page.getByTestId("palette-item")).toHaveText([
      "Checkout branch: topic",
    ]);
    await page.keyboard.press("Escape");

    // Clicking into the left pane moves the focus and swaps the commands.
    await slots.nth(0).getByTestId("tab").click();
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("checkout");
    await expect(page.getByTestId("palette-item")).toHaveText([
      "Checkout branch: feature",
    ]);
    await page.keyboard.press("Escape");
  });

  test("pressing a pane's graph background focuses the pane", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await page.locator('[data-repo-name="repoB"]').click({ button: "right" });
    await page.getByTestId("drawer-open-right").click();
    const slots = page.getByTestId("pane-slot");
    await expect(slots).toHaveCount(2);
    await expect(slots.nth(1)).toHaveClass(/pane-focused/);

    // The press that would tilt the thickness focuses the pane too.
    const box = (await slots.nth(0).getByTestId("graph").boundingBox())!;
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(slots.nth(0)).toHaveClass(/pane-focused/);
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
    await addRepo(page, fixtures.repoC);

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

  test("adding a repository shows an analyzing placeholder", async ({
    page,
  }) => {
    // Slow the add down so the analyzing state is deterministically
    // observable even though the fixture repo reads instantly.
    await page.route("**/api/repos", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.continue();
    });

    await addRepo(page, fixtures.repoC);

    // While the server analyzes, the drawer shows a pending entry and the
    // empty pane says what is being worked on.
    const pending = page.getByTestId("repo-pending");
    await expect(pending).toBeVisible();
    await expect(pending).toContainText("Analyzing");
    await expect(page.getByTestId("pane-empty")).toContainText("Analyzing");

    // The placeholder resolves into the real repository.
    await expect(page.locator('[data-tab-name="repoC"]')).toBeVisible();
    await expect(page.getByTestId("repo-pending")).toHaveCount(0);

    // Remove it again, restoring the served set.
    const repoC = page.locator('[data-repo-name="repoC"]');
    await repoC.hover();
    await repoC.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoC"]')).toHaveCount(0);
  });

  test("the drawer marks the repository the server is analyzing", async ({
    page,
  }) => {
    // Fixture repos read instantly, so the real SSE stream never keeps an
    // analyzing phase open long enough to observe; serve a synthetic one.
    const repos = (await (await page.request.get("/api/list")).json()) as {
      id: string;
    }[];
    const progress = { id: repos[0].id, commits: 1500 };
    await page.route("**/api/events", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `event: analyzing\ndata: ${JSON.stringify(progress)}\n\n`,
      }),
    );
    await page.reload();

    const item = page.locator('[data-repo-name="repoA"]');
    await expect(item.getByTestId("repo-analyzing")).toBeVisible();
    await expect(item).toHaveClass(/repo-pending/);
    // Position in the read plus the estimated percentage.
    await expect(item.getByTestId("repo-analyzing")).toContainText(
      "Analyzing… (1500 commits)",
    );
    // The other repository stays untouched.
    await expect(
      page.locator('[data-repo-name="repoB"]').getByTestId("repo-analyzing"),
    ).toHaveCount(0);
  });

  test("the analyzing note clears when the read finishes", async ({
    page,
  }) => {
    const repos = (await (await page.request.get("/api/list")).json()) as {
      id: string;
    }[];
    const progress = JSON.stringify({ id: repos[0].id, commits: 900 });
    // retry: 100 keeps the EventSource reconnecting quickly after each
    // fulfilled (and therefore closed) synthetic stream. One permanent
    // route switches its answer via the flag — re-routing would leave a
    // gap in which the reconnect could reach the real, never-ending SSE
    // stream and stick there.
    let finished = false;
    await page.route("**/api/events", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: finished
          ? `retry: 100\n\nevent: analyzed\ndata: ${repos[0].id}\n\n`
          : `retry: 100\n\nevent: analyzing\ndata: ${progress}\n\n`,
      }),
    );
    await page.reload();
    const note = page
      .locator('[data-repo-name="repoA"]')
      .getByTestId("repo-analyzing");
    await expect(note).toBeVisible();

    // The next (reconnected) stream reports completion: the note goes.
    finished = true;
    await expect(note).toHaveCount(0);
  });

  test("a read finishing within the debounce never shows the note", async ({
    page,
  }) => {
    const repos = (await (await page.request.get("/api/list")).json()) as {
      id: string;
    }[];
    const progress = JSON.stringify({ id: repos[0].id, commits: 0 });
    // Analyzing and analyzed arrive back to back, like any routine
    // millisecond read: the 300ms debounce must swallow the pair.
    await page.route("**/api/events", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `retry: 5000\n\nevent: analyzing\ndata: ${progress}\n\nevent: analyzed\ndata: ${repos[0].id}\n\n`,
      }),
    );
    await page.reload();
    await expect(page.getByTestId("repo-item")).toHaveCount(2);
    await page.waitForTimeout(600);
    await expect(page.getByTestId("repo-analyzing")).toHaveCount(0);
  });

  test("the repository list appears before any graph loads", async ({
    page,
  }) => {
    // Graph reads are slow: the instant list must fill the drawer first,
    // and an opened pane names what it is waiting for (ADR 0023).
    await page.route("**/api/view", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.reload();

    await expect(page.getByTestId("repo-item")).toHaveCount(2);
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.getByTestId("pane-empty")).toContainText("Analyzing");

    // The delayed view lands and replaces the placeholder with the graph.
    await expect(page.getByTestId("commit-row")).toHaveCount(5);
  });

  test("a pane opened mid-read shows how many commits are read", async ({
    page,
  }) => {
    // Hold the graph read open and feed a synthetic counter: the opened
    // pane must name the running commit count, not a stale zero.
    const list = (await (await page.request.get("/api/list")).json()) as {
      id: string;
    }[];
    await page.route("**/api/view", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await page.route("**/api/events", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `event: analyzing\ndata: ${JSON.stringify({
          id: list[0].id,
          commits: 1234,
        })}\n\n`,
      }),
    );
    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();

    const empty = page.getByTestId("pane-empty");
    await expect(empty).toContainText("Analyzing");
    await expect(empty).toContainText("(1234 commits)");
    await expect(empty).not.toContainText("(0 commits)");
  });

  test("graph rows page in until the whole history is shown", async ({
    page,
  }) => {
    // A tiny page size forces the paging machinery (ADR 0023): the first
    // fetch returns a prefix and the card keeps asking for more until the
    // pane holds every row.
    await page.addInitScript(() =>
      localStorage.setItem("gitreant-page-size", "2"),
    );
    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();

    await expect(page.getByTestId("commit-row")).toHaveCount(5);
    // The header names the true total, not the loaded page.
    await expect(page.locator(".repo-count")).toHaveText("5 commits");
  });

  test("adding while reading keeps the pane and lands in the drawer", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    await expect(page.locator(".repo-header h2")).toHaveText("repoA");

    await addRepo(page, fixtures.repoC);
    await expect(page.locator('[data-repo-name="repoC"]')).toBeVisible();

    // The pane being read stays put; no tab was forced open.
    await expect(page.locator(".repo-header h2")).toHaveText("repoA");
    await expect(page.locator('[data-tab-name="repoC"]')).toHaveCount(0);

    // Remove it again, restoring the served set.
    const repoC = page.locator('[data-repo-name="repoC"]');
    await repoC.hover();
    await repoC.getByTestId("repo-remove").click();
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
    await addRepo(page, fixtures.repoG);
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
    await addRepo(page, fixtures.repoH);
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
    await addRepo(page, fixtures.repoI!);
    // Adding repoI verifies its signature through gpg subprocesses; allow
    // more than the default 5 seconds on a loaded machine.
    await expect(page.locator('[data-tab-name="repoI"]')).toBeVisible({
      timeout: 15_000,
    });

    const verified = page
      .getByTestId("commit-row")
      .filter({ hasText: "verified tip" });
    const badge = verified.getByTestId("badge-signed");
    await expect(badge).toHaveText("Verified");
    await expect(badge).toHaveClass(/badge-verified/);
    // The line counts before it keep the same clearance a badge does.
    const stat = verified.getByTestId("commit-stat");
    await expect(stat).toBeVisible();
    const statBox = (await stat.boundingBox())!;
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.x - (statBox.x + statBox.width)).toBeGreaterThanOrEqual(6);

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

  test("the info dialog lists environment details for copying", async ({
    page,
  }) => {
    await page.getByTestId("info-toggle").click();
    await expect(page.getByTestId("info-panel")).toBeVisible();

    // CLI/SPA versions with commits, server, browser, language, viewport.
    await expect(page.getByTestId("info-value")).toHaveCount(6);
    await expect(page.getByTestId("info-value").first()).toContainText(
      /\d+\.\d+\.\d+ \(/,
    );
    await expect(page.getByTestId("info-copy-all")).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("info-panel")).toHaveCount(0);
  });

  test("the settings' choices are segmented buttons", async ({ page }) => {
    await page.getByTestId("settings-toggle").click();
    const groups = page.getByTestId("settings-panel").locator(".segmented");
    // Buttons, line counts, week start, language and date format.
    await expect(groups).toHaveCount(5);

    const segments = groups.first().locator(".segment");
    await expect(segments).toHaveCount(3);
    const boxes = await Promise.all(
      [0, 1, 2].map(async (i) => (await segments.nth(i).boundingBox())!),
    );
    // One row, side by side and touching.
    expect(boxes[1].y).toBeCloseTo(boxes[0].y, 0);
    expect(boxes[2].y).toBeCloseTo(boxes[0].y, 0);
    expect(boxes[1].x).toBeCloseTo(boxes[0].x + boxes[0].width, 0);
    expect(boxes[2].x).toBeCloseTo(boxes[1].x + boxes[1].width, 0);

    // The chosen segment is filled; choosing another moves the fill.
    const fill = (i: number) =>
      segments
        .nth(i)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByTestId("button-style-icon").click();
    const chosen = await fill(0);
    expect(chosen).not.toBe(await fill(1));
    await page.getByTestId("button-style-icon-label").click();
    expect(await fill(1)).toBe(chosen);
    expect(await fill(0)).not.toBe(chosen);
    await page.keyboard.press("Escape");
  });

  test("the log pane wraps, resizes and offers copy controls", async ({
    page,
  }) => {
    await page.getByTestId("log-toggle").click();
    const pane = page.getByTestId("log-pane");
    await expect(pane).toBeVisible();
    await page.getByTestId("reload").click();
    await expect(pane.getByTestId("log-entry").first()).toBeVisible();

    // The toolbar buttons follow the button-style setting.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("button-style-icon").click();
    await page.keyboard.press("Escape");
    const wrapButton = page.getByTestId("log-wrap-toggle");
    await expect(wrapButton).not.toContainText("Wrap");
    await expect(wrapButton.locator("svg")).toHaveCount(1);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("button-style-icon-label").click();
    await page.keyboard.press("Escape");
    await expect(wrapButton).toContainText("Wrap");

    // The wrap toggle flips the entries between clipped and wrapped.
    const entries = pane.locator(".log-entries");
    await expect(entries).not.toHaveClass(/log-wrap/);
    await page.getByTestId("log-wrap-toggle").click();
    await expect(entries).toHaveClass(/log-wrap/);

    // Copy controls: a per-line button surfaces on hover, plus copy-all.
    await expect(page.getByTestId("log-copy-all")).toBeEnabled();
    const entry = pane.getByTestId("log-entry").first();
    await entry.hover();
    await expect(entry.getByTestId("log-copy")).toBeVisible();

    // Dragging the top handle upward grows the pane.
    const before = (await pane.boundingBox())!.height;
    const box = (await page.getByTestId("log-resize").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 70);
    await page.mouse.up();
    expect((await pane.boundingBox())!.height).toBeGreaterThan(before);

    await page.getByTestId("log-wrap-toggle").click();
    await page.getByTestId("log-toggle").click();
  });

  test("a branch with an open PR links to its GitHub page", async ({
    page,
  }) => {
    // PR data comes from the user's gh CLI on the server; stub the endpoint
    // and verify the badge and squash-link wiring end to end.
    const list = (await (await page.request.get("/api/list")).json()) as {
      id: string;
      name: string;
    }[];
    const repoAView = (await (
      await page.request.post("/api/view", {
        data: { repo: list.find((r) => r.name === "repoA")!.id },
      })
    ).json()) as { commits: { id: string; summary: string }[] };
    const mergeCommit = repoAView.commits.find(
      (c) => c.summary === "merge feature",
    )!;
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
          merged: [
            {
              number: 6,
              url: "https://github.com/o/r/pull/6",
              branch: "feature",
              merge_commit: mergeCommit.id,
            },
          ],
        },
      }),
    );
    await page.locator('[data-repo-name="repoA"]').click();

    // The merged PR draws a dashed link between the surviving branch tip
    // and the commit it landed as.
    const squash = page.getByTestId("squash-edge");
    await expect(squash).toHaveCount(1);
    await expect(squash).toHaveAttribute("stroke-dasharray", "4 3");

    // Dragging the link aside is how you see what it crosses. This one runs
    // through its own corridor over several rows, so it is long enough to
    // measure the gesture on.
    const squashHit = page.getByTestId("squash-edge-hit");
    /** The drawn line, sampled in screen coordinates. */
    const samples = () =>
      squashHit.evaluate((el: SVGPathElement) => {
        const ctm = el.getScreenCTM()!;
        const length = el.getTotalLength();
        return Array.from({ length: 61 }, (_, i) => {
          const point = el.getPointAtLength((length * i) / 60);
          const screen = new DOMPoint(point.x, point.y).matrixTransform(ctm);
          return { x: screen.x, y: screen.y };
        });
      });
    const near = (
      line: { x: number; y: number }[],
      at: { x: number; y: number },
    ) => Math.min(...line.map((p) => Math.hypot(p.x - at.x, p.y - at.y)));

    // A fifth of the way along — as near the anchor as the cursor can get
    // before the commit node covers the line.
    const grab = (await samples())[12];
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();

    // The line must come with the cursor. Held this near an anchor, a single
    // quadratic could only reach the cursor by flinging its control point
    // out; here the two halves meet at the cursor instead.
    const to = { x: grab.x + 45, y: grab.y + 20 };
    await page.mouse.move(to.x, to.y);
    expect(near(await samples(), to)).toBeLessThan(4);
    await page.mouse.up();
    await expect(squash).toHaveCount(1);

    // The settings toggle hides the dashed links.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("squash-links-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("squash-edge")).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("squash-links-toggle").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("squash-edge")).toHaveCount(1);

    // A GitHub mark plus the visible PR number on the badge.
    const link = page.getByTestId("badge-pr");
    await expect(link.locator("svg")).toHaveCount(1);
    await expect(link).toContainText("#7");

    // The mark sits vertically centered on the (local, single-segment)
    // badge — it used to drift toward the top there.
    const badge = (await page
      .locator(".badge-ref", { hasText: "feature" })
      .first()
      .boundingBox())!;
    const mark = (await link.boundingBox())!;
    const badgeCenter = badge.y + badge.height / 2;
    const markCenter = mark.y + mark.height / 2;
    expect(Math.abs(markCenter - badgeCenter)).toBeLessThanOrEqual(1.5);
    await expect(link).toHaveAttribute("title", /#7/);
    await expect(link).toHaveAttribute(
      "href",
      "https://github.com/o/r/pull/7",
    );
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("the settings panel switches button display style", async ({
    page,
  }) => {
    // Default: icon + label, in the drawer and the top bar alike.
    const add = page.getByTestId("drawer-add");
    const reload = page.getByTestId("reload");
    await expect(add).toContainText("Add");
    await expect(add.locator("svg")).toHaveCount(1);
    await expect(reload).toContainText("Reload");

    await page.getByTestId("settings-toggle").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();

    // Icon only: the label leaves the text but stays as the tooltip.
    await page.getByTestId("button-style-icon").click();
    await expect(add).not.toContainText("Add");
    await expect(add.locator("svg")).toHaveCount(1);
    await expect(add).toHaveAttribute("title", "Add repository");
    await expect(reload).not.toContainText("Reload");

    // Label only: no icon.
    await page.getByTestId("button-style-label").click();
    await expect(add).toContainText("Add");
    await expect(add.locator("svg")).toHaveCount(0);
    await expect(reload).toContainText("Reload");

    // The choice survives a reload; the modal is gone after it.
    await page.reload();
    await expect(page.getByTestId("drawer-add").locator("svg")).toHaveCount(0);

    // The settings dialog is a modal that closes with Escape.
    await page.getByTestId("settings-toggle").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);
  });

  test("the language setting switches the UI language", async ({ page }) => {
    // The test browser reports an English locale, so "auto" starts English.
    const add = page.getByTestId("drawer-add");
    await expect(add).toContainText("Add");

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("language-ja").click();
    await expect(add).toContainText("追加");
    await expect(page.locator(".drawer-title")).toHaveText("リポジトリ");

    // The choice survives a reload; back to English restores the labels.
    await page.reload();
    await expect(page.getByTestId("drawer-add")).toContainText("追加");
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("language-en").click();
    await expect(page.getByTestId("drawer-add")).toContainText("Add");
    await page.keyboard.press("Escape");
  });

  test("the date format setting restyles every timestamp", async ({ page }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const time = page.getByTestId("commit-time").first();
    // ISO is the default: fixed width, unambiguous, locale-independent.
    await expect(time).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("date-format-relative").click();
    await page.keyboard.press("Escape");
    await expect(time).toHaveText(/ago$/);
    // No format hides the exact moment: the tooltip stays absolute.
    await expect(time).toHaveAttribute(
      "title",
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );

    // The choice survives a reload and reaches the commit details too.
    await page.reload();
    await page.locator('[data-repo-name="repoA"]').click();
    await page.getByTestId("commit-row").first().click();
    await expect(page.getByTestId("commit-detail")).toContainText("ago");

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("date-format-iso").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("commit-time").first()).toHaveText(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  test("the settings dialog re-verifies signatures on demand", async ({
    page,
  }) => {
    let refreshed = false;
    await page.route("**/api/refresh", (route) => {
      refreshed = true;
      route.fulfill({ status: 200, body: "" });
    });

    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("reverify").click();
    // The action fires and closes the dialog.
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);
    await expect.poll(() => refreshed).toBe(true);
  });

  test("the command palette opens with Ctrl+K and runs commands", async ({
    page,
  }) => {
    // The shortcut listener registers in an effect after the first render;
    // wait for data-driven UI so pressing the key cannot race it.
    await expect(page.getByTestId("repo-item").first()).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();

    // Typing filters; Enter runs the first match ("Open repository",
    // ahead of "Open in right pane").
    await page.getByTestId("palette-input").fill("repoB");
    await expect(page.getByTestId("palette-item")).toHaveCount(2);
    await page.keyboard.press("Enter");
    await expect(palette).toHaveCount(0);
    await expect(page.locator('[data-tab-name="repoB"]')).toBeVisible();
    await expect(page.getByTestId("commit-row")).toHaveCount(3);

    // Clicking an item works too, and the log pane has a fixed height.
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("command log");
    await page.getByTestId("palette-item").first().click();
    const pane = page.getByTestId("log-pane");
    await expect(pane).toBeVisible();
    expect((await pane.boundingBox())!.height).toBe(180);

    // Escape closes the palette without running anything.
    await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);

    // Settings live in the palette too (via the command registry): the
    // squash-link toggle flips without opening the settings modal.
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("squash");
    await page.getByTestId("palette-item").first().click();
    await page.getByTestId("settings-toggle").click();
    await expect(page.getByTestId("squash-links-toggle")).not.toBeChecked();
    await page.keyboard.press("Escape");
  });

  test("a diff opens the unchanged lines around its hunks", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoT);
    await expect(page.locator('[data-tab-name="repoT"]')).toBeVisible();
    await page.getByTestId("commit-row").filter({ hasText: "t-2" }).click();
    await page
      .getByTestId("detail-file")
      .filter({ hasText: "long.txt" })
      .click();
    await page.getByTestId("diff-view-inline").click();
    const pane = page.getByTestId("diff-pane");
    const line = (no: number) =>
      pane.locator('[data-testid="line-no"]', {
        hasText: new RegExp(`^${no}$`),
      });
    const gaps = pane.getByTestId("diff-gap");

    // Lines 27 to 33 show around the change; the rest hides above and below.
    await expect(gaps).toHaveCount(2);
    await expect(gaps.first()).toContainText("26 lines hidden");
    await expect(gaps.last()).toContainText("27 lines hidden");
    await expect(line(26)).toHaveCount(0);
    // Twenty lines up from the hunk, then the six left at once.
    await gaps.first().getByTestId("gap-up").click();
    await expect(line(7)).toHaveCount(1);
    await expect(line(6)).toHaveCount(0);
    await gaps.first().getByTestId("gap-all").click();
    await expect(line(1)).toHaveCount(1);
    await expect(gaps).toHaveCount(1);
    // Twenty down from the hunk leaves seven at the end.
    await gaps.getByTestId("gap-down").click();
    await expect(line(53)).toHaveCount(1);
    await expect(gaps.getByTestId("gap-all")).toContainText("7");
    // The whole file opens what is left.
    await pane.getByTestId("diff-whole-file").click();
    await expect(gaps).toHaveCount(0);
    await expect(line(60)).toHaveCount(1);
    await expect(pane.getByTestId("diff-whole-file")).toHaveCount(0);

    const repoT = page.locator('[data-repo-name="repoT"]');
    await repoT.hover();
    await repoT.getByTestId("repo-remove").click();
    await expect(repoT).toHaveCount(0);
  });

  test("diff lines can be selected, copied and permalinked", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await addRepo(page, fixtures.repoK);
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
    const newLink = await page.evaluate(() => navigator.clipboard.readText());
    expect(newLink).toMatch(
      /^https:\/\/github\.com\/example\/repoK\/blob\/[0-9a-f]{40}\/list\.txt#L3-L5$/,
    );
    const copyFromMenu = async (testId: string) => {
      await trigger.click();
      await page.getByTestId(testId).click();
      return page.evaluate(() => navigator.clipboard.readText());
    };
    // The same link, named by the file and its lines, for Markdown and Typst.
    expect(await copyFromMenu("copy-permalink-markdown")).toBe(
      `[list.txt#L3-L5](${newLink})`,
    );
    expect(await copyFromMenu("copy-permalink-typst")).toBe(
      `#link("${newLink}")[list.txt\\#L3-L5]`,
    );
    // The file's path, relative and absolute, for another tool.
    expect(await copyFromMenu("copy-file-path")).toBe("list.txt");
    expect(await copyFromMenu("copy-file-absolute-path")).toMatch(
      /repoK[\\/]list\.txt$/,
    );
    // The file's head copies its path too.
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.getByTestId("diff-copy-path").click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("list.txt");

    // Escape clears the selection and the trigger with it; the pane stays
    // until a second Escape.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("line-menu-trigger")).toHaveCount(0);
    await expect(page.getByTestId("diff-pane")).toBeVisible();

    // Split view: selecting on the old (left) side permalinks the parent
    // commit's file with old-side line numbers.
    await page.getByTestId("diff-view-split").click();
    await page
      .locator('.split-cell:first-child [data-testid="line-no"]', {
        hasText: /^2$/,
      })
      .click();
    await page.getByTestId("line-menu-trigger").click();
    await page.getByTestId("copy-permalink").click();
    const oldLink = await page.evaluate(() => navigator.clipboard.readText());
    expect(oldLink).toMatch(
      /^https:\/\/github\.com\/example\/repoK\/blob\/[0-9a-f]{40}\/list\.txt#L2$/,
    );
    // The old side addresses the parent commit, not this one.
    const sha = (link: string) => /blob\/([0-9a-f]{40})/.exec(link)![1];
    expect(sha(oldLink)).not.toBe(sha(newLink));
    await page.keyboard.press("Escape");

    // Restore the served set.
    const repoK = page.locator('[data-repo-name="repoK"]');
    await repoK.hover();
    await repoK.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoK"]')).toHaveCount(0);
  });

  test("the commit menu copies the hash and the commit's web page", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await addRepo(page, fixtures.repoK);
    await expect(page.locator('[data-tab-name="repoK"]')).toBeVisible();

    const node = page.getByTestId("graph-node").first();
    const menu = page.getByTestId("commit-menu");
    await node.click({ button: "right" });
    await menu.getByTestId("commit-menu-copy-hash").click();
    await expect(menu).toHaveCount(0);
    const id = await page.evaluate(() => navigator.clipboard.readText());
    expect(id).toMatch(/^[0-9a-f]{40}$/);

    // repoK's origin is on github.com: its commit page can be copied or
    // opened in a new tab.
    const url = `https://github.com/example/repoK/commit/${id}`;
    await node.click({ button: "right" });
    await menu.getByTestId("commit-menu-copy-url").click();
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // The page opens in a new tab (stubbed: the test never goes online),
    // and the menu closes behind it.
    await context.route("https://github.com/**", (route) =>
      route.fulfill({ body: "stub" }),
    );
    await node.click({ button: "right" });
    const [tab] = await Promise.all([
      context.waitForEvent("page"),
      menu.getByTestId("commit-menu-open-url").click(),
    ]);
    expect(tab.url()).toBe(url);
    await tab.close();
    await expect(menu).toHaveCount(0);

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
    // Three server-side git operations back to back (checkout, merge,
    // palette checkout), each allowed up to 15-30s on a loaded machine —
    // the default 30s per-test budget cannot hold them all.
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await addRepo(page, fixtures.repoJ);
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
      timeout: 30_000,
    });
    await expect(
      page.getByTestId("commit-row").filter({ hasText: "Merge branch 'main'" }),
    ).toBeVisible();

    // The visible repo's branches are palette commands too (registered by
    // the card through the command registry): checkout main via Ctrl+K.
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("checkout");
    await page
      .getByTestId("palette-item")
      .filter({ hasText: "main" })
      .click();
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(
      page
        .getByTestId("commit-row")
        .filter({ hasText: "j-2" })
        .locator(".badge-head"),
    ).toBeVisible({ timeout: 15_000 });

    // Restore the served set (the on-disk mutation is repoJ-local).
    const repoJ = page.locator('[data-repo-name="repoJ"]');
    await repoJ.hover();
    await repoJ.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoJ"]')).toHaveCount(0);
  });

  test("tags and the stash render apart from branch badges", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoL);
    await expect(page.locator('[data-tab-name="repoL"]')).toBeVisible();

    const tag = page.locator(".badge-kind-tag", { hasText: "v1.0" });
    await expect(tag).toBeVisible();
    await expect(tag.locator("svg")).toHaveCount(1);

    const stash = page.locator(".badge-kind-stash", { hasText: "stash" });
    await expect(stash).toBeVisible();
    await expect(stash.locator("svg")).toHaveCount(1);

    // The branch badge carries its own icon, like tags and the stash.
    const branch = page.locator(".badge-kind-branch", { hasText: "main" });
    await expect(branch).toBeVisible();
    await expect(branch.locator("svg")).toHaveCount(1);
    // The stash's node is a ring around a dot, in a color of its own rather
    // than the color of the HEAD line it sits on.
    const ring = page.locator("circle.node-stash");
    await expect(ring).toHaveCount(1);
    const graph = page.locator(".graph", { has: ring });
    await expect(graph.locator("circle.node-stash-dot")).toHaveCount(1);
    const stashColor = await ring.evaluate((el) => getComputedStyle(el).stroke);
    const headColor = await graph
      .locator("circle.node-head")
      .evaluate((el) => getComputedStyle(el).stroke);
    expect(stashColor).not.toBe(headColor);
    await expect(graph.locator("circle.node-stash-dot")).toHaveCSS(
      "fill",
      stashColor,
    );

    // The stash has no operations.
    await stash.click({ button: "right" });
    await expect(page.getByTestId("ref-menu")).toHaveCount(0);

    // Restore the served set.
    const repoL = page.locator('[data-repo-name="repoL"]');
    await repoL.hover();
    await repoL.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoL"]')).toHaveCount(0);
  });

  test("a stash folds to one node until its internals toggle on", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoM);
    await expect(page.locator('[data-tab-name="repoM"]')).toBeVisible();

    // Folded by default: no dashed helper links, the stash reads as one node.
    await expect(page.getByTestId("stash-edge")).toHaveCount(0);
    const foldedRows = await page.getByTestId("commit-row").count();

    // Reveal: the index and untracked helpers appear, linked by dashed edges.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("stash-internals-toggle").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("stash-edge").first()).toHaveAttribute(
      "stroke-dasharray",
      "4 3",
    );
    expect(await page.getByTestId("commit-row").count()).toBeGreaterThan(
      foldedRows,
    );

    // Hiding folds them back to the single node.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("stash-internals-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("stash-edge")).toHaveCount(0);

    // Restore the served set.
    const repoM = page.locator('[data-repo-name="repoM"]');
    await repoM.hover();
    await repoM.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoM"]')).toHaveCount(0);
  });

  test("a noreply author gets a GitHub avatar the toggle can hide", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoN);
    await expect(page.locator('[data-tab-name="repoN"]')).toBeVisible();
    await page.locator('[data-repo-name="repoN"]').click();

    // The noreply email resolves to an avatar URL with no network call.
    const avatar = page.getByTestId("commit-avatar").first();
    await expect(avatar).toHaveAttribute(
      "src",
      "https://avatars.githubusercontent.com/u/1?v=4",
    );

    // The settings toggle removes the avatars entirely.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("avatars-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("commit-avatar")).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("avatars-toggle").check();
    await page.keyboard.press("Escape");
    // The <img> may not load offline (it hides itself on error), so assert it
    // is back in the DOM rather than visible.
    await expect(page.getByTestId("commit-avatar")).toHaveCount(1);

    // Restore the served set.
    const repoN = page.locator('[data-repo-name="repoN"]');
    await repoN.hover();
    await repoN.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoN"]')).toHaveCount(0);
  });

  test("a superproject groups its submodules in an accordion", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoO);
    await expect(page.locator('[data-tab-name="repoO"]')).toBeVisible();

    const repoO = page.locator('[data-repo-name="repoO"]');
    // Collapsed by default: the submodule child is hidden behind a disclosure.
    await expect(repoO.getByTestId("repo-disclosure")).toBeVisible();
    await expect(page.getByTestId("repo-submodule")).toHaveCount(0);

    // Expanding reveals the "sub" submodule; clicking it attaches and views it.
    await repoO.getByTestId("repo-disclosure").click();
    const sub = page.locator('[data-testid="repo-submodule"][data-repo-name="sub"]');
    await expect(sub).toBeVisible();
    // The child row carries the same button affordance as a top-level one.
    await expect(sub).toHaveAttribute("role", "button");
    await expect(sub).toHaveAttribute("tabindex", "0");
    await sub.click();
    await expect(page.locator('[data-tab-name="sub"]')).toBeVisible();
    await expect(page.getByTestId("graph").first()).toBeVisible();

    // The server records that the page opened it as a submodule, and that
    // repoO came through the drawer's input (ADR 0039).
    const list = (await (await page.request.get("/api/list")).json()) as {
      name: string;
      added?: { via: string; reason?: string };
    }[];
    const added = (name: string) => list.find((e) => e.name === name)?.added;
    expect(added("sub")).toMatchObject({ via: "browser", reason: "submodule" });
    expect(added("repoO")).toMatchObject({ via: "browser", reason: "add" });

    // The opened submodule stays an accordion child: no duplicate top-level
    // row appears in the drawer.
    await expect(
      page.locator('[data-testid="repo-item"][data-repo-name="sub"]'),
    ).toHaveCount(0);

    // Removing the superproject first surfaces the still-attached submodule
    // as a top-level row (nothing declares it anymore); remove that too.
    await repoO.hover();
    await repoO.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoO"]')).toHaveCount(0);
    const subRow = page.locator('[data-testid="repo-item"][data-repo-name="sub"]');
    await expect(subRow).toBeVisible();
    await subRow.hover();
    await subRow.getByTestId("repo-remove").click();
    await expect(subRow).toHaveCount(0);
  });

  test("submodule graph nodes name their commit and open its menu", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await addRepo(page, fixtures.repoO);
    await page.locator('[data-repo-name="repoO"]').click();
    const node = page.getByTestId("submodule-node");
    await expect(node).toHaveCount(1);

    // Hovering names the commit the way a main graph node does, with the
    // submodule it belongs to.
    await node.hover();
    const tip = page.getByTestId("node-tip");
    await expect(tip).toHaveText(/^[0-9a-f]{7} sub: sub-1$/);
    const short = (await tip.textContent())!.slice(0, 7);
    await page.mouse.move(0, 0);

    // The menu copies the id and the page on the submodule's own origin;
    // refs cannot be created there, since they would land in another
    // repository.
    await node.click({ button: "right" });
    const menu = page.getByTestId("commit-menu");
    await expect(menu.locator(".ctx-menu-note")).toHaveText(short);
    await expect(menu.getByTestId("commit-menu-tag")).toHaveCount(0);
    await expect(menu.getByTestId("commit-menu-branch")).toHaveCount(0);
    await menu.getByTestId("commit-menu-copy-hash").click();
    const id = await page.evaluate(() => navigator.clipboard.readText());
    expect(id.startsWith(short)).toBe(true);
    await node.click({ button: "right" });
    await menu.getByTestId("commit-menu-copy-url").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `https://github.com/example/repoO-sub/commit/${id}`,
    );

    // Restore the served set.
    const repoO = page.locator('[data-repo-name="repoO"]');
    await repoO.hover();
    await repoO.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoO"]')).toHaveCount(0);
  });

  test("a submodule region's menu opens the submodule in a tab", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoO);
    await page.locator('[data-repo-name="repoO"]').click();
    await expect(page.getByTestId("submodule-node")).toHaveCount(1);

    // The region's empty background, away from its node, takes the click.
    const node = (await page.getByTestId("submodule-node").boundingBox())!;
    const region = (await page.getByTestId("submodule-region-hit").boundingBox())!;
    await page.mouse.click(region.x + 3, node.y + node.height + 10, {
      button: "right",
    });
    const menu = page.getByTestId("context-menu");
    await expect(menu.getByTestId("region-open")).toBeVisible();
    await expect(menu.getByTestId("region-open-right")).toBeVisible();
    await menu.getByTestId("region-open").click();
    await expect(page.locator('[data-tab-name="sub"]')).toHaveClass(/\bactive\b/);
    const list = (await (await page.request.get("/api/list")).json()) as {
      name: string;
      added?: { via: string; reason?: string };
    }[];
    expect(list.find((e) => e.name === "sub")?.added).toMatchObject({
      via: "browser",
      reason: "submodule",
    });

    // A collapsed strip offers the same menu.
    await page.locator('[data-tab-name="repoO"]').click();
    await page.getByTestId("region-collapse").click();
    await page.getByTestId("region-expand").click({ button: "right" });
    await expect(page.getByTestId("region-open")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("region-expand").click();

    // Restore the served set: the superproject, then the submodule it
    // leaves as a top-level row.
    const repoO = page.locator('[data-repo-name="repoO"]');
    await repoO.hover();
    await repoO.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoO"]')).toHaveCount(0);
    const subRow = page.locator('[data-testid="repo-item"][data-repo-name="sub"]');
    await subRow.hover();
    await subRow.getByTestId("repo-remove").click();
    await expect(subRow).toHaveCount(0);
  });

  test("a submodule two levels down opens from its region and stays open", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoS);
    await page.locator('[data-repo-name="repoS"]').click();
    await expect(page.getByTestId("submodule-node")).toHaveCount(1);

    const node = (await page.getByTestId("submodule-node").boundingBox())!;
    const region = (await page.getByTestId("submodule-region-hit").boundingBox())!;
    await page.mouse.click(region.x + 3, node.y + node.height + 10, {
      button: "right",
    });
    await page.getByTestId("region-open").click();
    const tab = page.locator('[data-tab-name="deep"]');
    await expect(tab).toHaveClass(/\bactive\b/);
    // The tab names a repository the server shows, so it stays.
    await page.waitForTimeout(500);
    await expect(tab).toHaveClass(/\bactive\b/);
    await expect(page.getByTestId("pane-empty")).toHaveCount(0);

    // Restore the served set.
    const repoS = page.locator('[data-repo-name="repoS"]');
    await repoS.hover();
    await repoS.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoS"]')).toHaveCount(0);
    const deepRow = page.locator('[data-testid="repo-item"][data-repo-name="deep"]');
    await deepRow.hover();
    await deepRow.getByTestId("repo-remove").click();
    await expect(deepRow).toHaveCount(0);
  });

  test("a submodule graph collapses to a strip and stays collapsed", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoO);
    await page.locator('[data-repo-name="repoO"]').click();
    const region = page.getByTestId("submodule-region");
    await expect(page.getByTestId("submodule-node")).toHaveCount(1);
    await expect(page.getByTestId("submodule-edge")).toHaveCount(1);
    const wide = (await page.getByTestId("graph").getAttribute("width"))!;

    // Collapsing leaves a named strip: no nodes, no links, a narrower graph.
    // The whole button takes the press, even where the dashed link to the
    // submodule's newest commit runs past it.
    const toggle = (await page.getByTestId("region-collapse").boundingBox())!;
    await page.mouse.click(
      toggle.x + toggle.width / 2,
      toggle.y + toggle.height - 3,
    );
    await expect(page.getByTestId("submodule-node")).toHaveCount(0);
    await expect(page.getByTestId("submodule-edge")).toHaveCount(0);
    const strip = region.getByTestId("region-expand");
    await expect(strip).toContainText("sub");
    const inside = await strip.evaluate((g) => {
      const rect = g.querySelector("rect")!.getBoundingClientRect();
      const text = g.querySelector("text")!.getBoundingClientRect();
      return text.left >= rect.left - 0.5 && text.right <= rect.right + 0.5;
    });
    expect(inside).toBe(true);
    const narrow = (await page.getByTestId("graph").getAttribute("width"))!;
    expect(Number(narrow)).toBeLessThan(Number(wide));

    // The choice is kept per repository across a reload.
    await page.reload();
    await page.locator('[data-repo-name="repoO"]').click();
    await expect(region.getByTestId("region-expand")).toBeVisible();
    await expect(page.getByTestId("submodule-node")).toHaveCount(0);

    // The strip expands it again, from the keyboard too.
    await region.getByTestId("region-expand").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("submodule-node")).toHaveCount(1);
    await expect(page.getByTestId("submodule-edge")).toHaveCount(1);

    // Restore the served set.
    const repoO = page.locator('[data-repo-name="repoO"]');
    await repoO.hover();
    await repoO.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoO"]')).toHaveCount(0);
  });

  test("a superproject draws its submodule graph with dashed pointer links", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoO);
    await expect(page.locator('[data-tab-name="repoO"]')).toBeVisible();
    await page.locator('[data-repo-name="repoO"]').click();

    // The submodule renders as its own region left of the main graph, and
    // the commit that added the pointer links across with a dashed edge.
    await expect(page.getByTestId("submodule-region")).toHaveCount(1);
    const cross = page.getByTestId("submodule-edge");
    await expect(cross).toHaveCount(1);
    await expect(cross).toHaveAttribute("stroke-dasharray", "4 3");

    // Grabbing the dashed link rubber-bands it toward the cursor (its path
    // becomes a pulled quadratic); releasing snaps it back.
    const original = (await cross.getAttribute("d"))!;
    const shape = (await cross.boundingBox())!;
    const hit = page.getByTestId("submodule-edge-hit");
    const box = (await hit.boundingBox())!;
    const mx = box.x + box.width / 2;
    const my = box.y + box.height / 2;
    await page.mouse.move(mx, my);
    await page.mouse.down();
    await page.mouse.move(mx + 12, my + 30);
    await expect(cross).toHaveAttribute("d", / Q/);
    await page.mouse.up();
    await expect(cross).toHaveAttribute("d", original);

    expect((await cross.boundingBox())!.height).toBeCloseTo(shape.height, 0);

    // The settings toggle removes the regions and links entirely.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("submodule-links-toggle").uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("submodule-region")).toHaveCount(0);
    await expect(page.getByTestId("submodule-edge")).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("submodule-links-toggle").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("submodule-region")).toHaveCount(1);

    // Restore the served set.
    const repoO = page.locator('[data-repo-name="repoO"]');
    await repoO.hover();
    await repoO.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoO"]')).toHaveCount(0);
  });

  test("tags can be created on a commit and deleted from their badge", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoL);
    await expect(page.locator('[data-tab-name="repoL"]')).toBeVisible();

    // Right-clicking a commit row opens an action list; picking "create
    // tag" reveals the name input. The stash's WIP messages also contain
    // "l-1", so pick the row via its v1.0 badge.
    const l1Row = page
      .getByTestId("commit-row")
      .filter({ has: page.locator(".badge-kind-tag") })
      .first();
    await l1Row.click({ button: "right" });
    await page.getByTestId("commit-menu-tag").click();
    await page.getByTestId("ref-name-input").fill("v2.0");
    await page.getByTestId("ref-create").click();
    const created = page.locator(".badge-kind-tag", { hasText: "v2.0" });
    await expect(created).toBeVisible({ timeout: 15_000 });

    // The same menu creates a branch at the commit, without a checkout.
    await l1Row.click({ button: "right" });
    await page.getByTestId("commit-menu-branch").click();
    await page.getByTestId("ref-name-input").fill("topic2");
    await page.getByTestId("ref-create").click();
    await expect(
      page.locator(".badge-kind-branch", { hasText: "topic2" }),
    ).toBeVisible({ timeout: 15_000 });
    // HEAD stays on main (no checkout happened).
    await expect(l1Row.locator(".badge-head")).toHaveCount(1);

    // The tag badge's context menu deletes it again after confirmation.
    await created.click({ button: "right" });
    await page.getByTestId("ref-menu-delete-tag").click();
    await page.getByTestId("ref-menu-confirm").click();
    await expect(
      page.locator(".badge-kind-tag", { hasText: "v2.0" }),
    ).toHaveCount(0, { timeout: 15_000 });

    // Restore the served set.
    const repoL = page.locator('[data-repo-name="repoL"]');
    await repoL.hover();
    await repoL.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoL"]')).toHaveCount(0);
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

  test("hovering a branch badge fades the rows it cannot reach", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const faded = page.locator(".commit-faded");

    // feature reaches feature-1, main-1 and root; the merge and main-2
    // came later on main.
    await page.locator(".badge-kind-branch", { hasText: "feature" }).hover();
    await expect(faded).toHaveCount(2);
    await expect(rows.filter({ hasText: "merge feature" })).toHaveClass(
      /commit-faded/,
    );
    await expect(rows.filter({ hasText: "main-2" })).toHaveClass(
      /commit-faded/,
    );
    await expect(rows.filter({ hasText: "feature-1" })).not.toHaveClass(
      /commit-faded/,
    );
    // The graph fades with the rows: their two nodes, and the edges that
    // touch either of them.
    await expect(page.locator(".graph .node.faded")).toHaveCount(2);
    await expect(page.locator(".graph path.faded").first()).toBeAttached();

    // Leaving the badge restores every row and the graph.
    await page.mouse.move(0, 0);
    await expect(faded).toHaveCount(0);
    await expect(page.locator(".graph .faded")).toHaveCount(0);

    // A reload that moves the hovered badge to another row unmounts it
    // before the pointer leaves; the fade must not outlive it.
    const featureTip = execFileSync("git", ["rev-parse", "feature"], {
      cwd: fixtures.repoA,
      encoding: "utf8",
    }).trim();
    try {
      await page.locator(".badge-kind-branch", { hasText: "feature" }).hover();
      await expect(faded).toHaveCount(2);
      git(fixtures.repoA, ["branch", "-f", "feature", "feature~1"]);
      await page.request.post("/api/refresh");
      await expect(
        rows.filter({ hasText: "main-1" }).locator(".badge-kind-branch"),
      ).toHaveCount(1);
      await page.mouse.move(0, 0);
      await expect(faded).toHaveCount(0);
    } finally {
      git(fixtures.repoA, ["branch", "-f", "feature", featureTip]);
      await page.request.post("/api/refresh");
    }
  });

  test("hovering a node fades everything off its first-parent chain", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const nodes = page.getByTestId("graph-node");
    const faded = page.locator(".commit-faded");
    const nodeOf = async (summary: string) => {
      const texts = await rows.allTextContents();
      return nodes.nth(texts.findIndex((text) => text.includes(summary)));
    };

    // The merge's first parent is main-2, so only feature-1 is off its
    // chain, although the merge reaches it through its second parent.
    await (await nodeOf("merge feature")).hover();
    await expect(faded).toHaveCount(1);
    await expect(rows.filter({ hasText: "feature-1" })).toHaveClass(
      /commit-faded/,
    );
    await expect(page.locator(".graph .node.faded")).toHaveCount(1);

    // feature-1's chain runs down to main-1 and root; the later main
    // commits fade.
    await (await nodeOf("feature-1")).hover();
    await expect(faded).toHaveCount(2);
    await expect(rows.filter({ hasText: "main-2" })).toHaveClass(
      /commit-faded/,
    );
    await expect(rows.filter({ hasText: "merge feature" })).toHaveClass(
      /commit-faded/,
    );

    await page.mouse.move(0, 0);
    await expect(faded).toHaveCount(0);
    await expect(page.locator(".graph .faded")).toHaveCount(0);
  });

  test("the keyboard and the commit menu move the selection", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const selected = page.locator(".commit.selected");
    const row = (summary: string) => rows.filter({ hasText: summary });

    // With nothing selected, a move starts at the first row.
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(0)).toHaveClass(/selected/);
    await expect(page.getByTestId("commit-detail")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toHaveClass(/selected/);
    await page.keyboard.press("ArrowUp");
    await expect(rows.nth(0)).toHaveClass(/selected/);

    // → and ← cross lanes: feature-1 is the only commit off main's lane,
    // and nothing lies further right.
    await expect(row("merge feature")).toHaveClass(/selected/);
    await page.keyboard.press("ArrowRight");
    await expect(row("feature-1")).toHaveClass(/selected/);
    await page.keyboard.press("ArrowRight");
    await expect(row("feature-1")).toHaveClass(/selected/);
    await page.keyboard.press("ArrowLeft");
    await expect(row("feature-1")).not.toHaveClass(/selected/);
    await expect(selected).toHaveCount(1);

    // The menu lists both of the merge's parents; picking one selects it.
    await row("merge feature").click({ button: "right" });
    const menu = page.getByTestId("commit-menu");
    await expect(menu.getByTestId("commit-menu-parent")).toHaveCount(2);
    await expect(menu.getByTestId("commit-menu-child")).toHaveCount(0);
    await menu.getByTestId("commit-menu-parent").filter({ hasText: "feature-1" }).click();
    await expect(menu).toHaveCount(0);
    await expect(row("feature-1")).toHaveClass(/selected/);

    // Enter opens every file's diff in place of the graph; while it shows,
    // the arrows leave the selection alone and Esc returns to the graph.
    await page.keyboard.press("Enter");
    const diff = page.getByTestId("diff-pane");
    await expect(diff).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(diff).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(diff).toHaveCount(0);
    await expect(row("feature-1")).toHaveClass(/selected/);
    await page.getByTestId("detail-close").click();

    // hjkl move only once the setting is on.
    await page.keyboard.press("j");
    await expect(selected).toHaveCount(0);
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("vim-keys-toggle").check();
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await expect(rows.nth(0)).toHaveClass(/selected/);
    await page.keyboard.press("l");
    await expect(row("feature-1")).toHaveClass(/selected/);

    // G and gg jump to the last and first rows, as End and Home do.
    await page.keyboard.press("G");
    await expect(rows.nth(4)).toHaveClass(/selected/);
    await page.keyboard.press("g");
    await expect(rows.nth(4)).toHaveClass(/selected/);
    await page.keyboard.press("g");
    await expect(rows.nth(0)).toHaveClass(/selected/);
    await page.keyboard.press("End");
    await expect(rows.nth(4)).toHaveClass(/selected/);
    await page.keyboard.press("Home");
    await expect(rows.nth(0)).toHaveClass(/selected/);

    // Esc clears the selection.
    await page.keyboard.press("Escape");
    await expect(selected).toHaveCount(0);
    await expect(page.getByTestId("commit-detail")).toHaveCount(0);
  });

  test("the commit menu compares another commit with the selected one", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const row = (summary: string) => rows.filter({ hasText: summary });
    const hash = async (summary: string) =>
      (await row(summary).getByTestId("commit-hash").textContent()) ?? "";
    const menu = page.getByTestId("commit-menu");

    // Nothing selected, or the selected commit's own menu: nothing to compare.
    await row("merge feature").click({ button: "right" });
    await expect(menu.getByTestId("commit-menu-compare")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await row("main-1").click();
    await row("main-1").click({ button: "right" });
    await expect(menu.getByTestId("commit-menu-compare")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // From the merge's menu: main-1 is its ancestor, so it is the base.
    const range = `${await hash("main-1")}..${await hash("merge feature")}`;
    await row("merge feature").click({ button: "right" });
    await menu.getByTestId("commit-menu-compare").click();
    const diff = page.getByTestId("diff-pane");
    await expect(diff).toBeVisible();
    await expect(page.getByTestId("diff-range")).toHaveText(range);
    // main-2 and feature-1 both changed files since main-1.
    await expect(diff.locator(".diff-title")).toContainText("files");

    // The side pane shows both commits and the files between them.
    const side = page.getByTestId("compare-detail");
    await expect(side.getByTestId("compare-base")).toContainText("main-1");
    await expect(side.getByTestId("compare-target")).toContainText(
      "merge feature",
    );
    const files = side.getByTestId("compare-file");
    expect(await files.count()).toBeGreaterThan(1);
    await expect(files.first()).toContainText(/\+\d+ −\d+/);
    const last = files.last();
    const path = (await last.locator(".file-path").textContent()) ?? "";
    await last.click();
    await expect(
      diff.locator(`[data-diff-path="${path}"]`),
    ).toBeInViewport();

    // Closing it ends the comparison: the selection's own details return.
    await page.getByTestId("compare-close").click();
    await expect(diff).toHaveCount(0);
    await expect(side).toHaveCount(0);
    await expect(page.getByTestId("commit-detail")).toBeVisible();
    await expect(row("main-1")).toHaveClass(/selected/);
  });

  test("the commit menu checks a commit out detached after a confirmation", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const row = (summary: string) => rows.filter({ hasText: summary });
    const menu = page.getByTestId("commit-menu");

    // Cancel leaves HEAD where it was.
    await row("main-1").click({ button: "right" });
    await menu.getByTestId("commit-menu-checkout").click();
    await expect(menu.locator(".ref-menu-question")).toContainText("detached");
    await menu.getByTestId("commit-menu-cancel").click();
    await expect(menu).toHaveCount(0);
    await expect(row("main-1").locator(".badge-head")).toHaveCount(0);

    try {
      await row("main-1").click({ button: "right" });
      await menu.getByTestId("commit-menu-checkout").click();
      await menu.getByTestId("commit-menu-confirm").click();
      await expect(row("main-1").locator(".badge-head")).toBeVisible({
        timeout: 15_000,
      });
      // No branch is checked out: HEAD names the commit itself.
      const branch = execFileSync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: fixtures.repoA, encoding: "utf8" },
      ).trim();
      expect(branch).toBe("HEAD");
    } finally {
      git(fixtures.repoA, ["switch", "-q", "main"]);
      await page.request.post("/api/refresh");
    }
    await expect(row("merge feature").locator(".badge-head")).toBeVisible();
  });

  test("graph nodes show their hash on hover and open the commit menu", async ({
    page,
  }) => {
    await page.locator('[data-repo-name="repoA"]').click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(5);
    const nodes = page.getByTestId("graph-node");
    await expect(nodes).toHaveCount(5);

    // Hovering a node reveals the abbreviated hash of the commit in its row.
    const shown =
      (await rows.nth(2).getByTestId("commit-hash").textContent()) ?? "";
    expect(shown).toMatch(/^[0-9a-f]{7}$/);
    await nodes.nth(2).hover();
    await expect(page.getByTestId("node-tip")).toHaveText(shown);
    await page.mouse.move(0, 0);
    await expect(page.getByTestId("node-tip")).toHaveCount(0);

    // Right-clicking a node offers the same actions as its row.
    await nodes.nth(2).click({ button: "right" });
    const menu = page.getByTestId("commit-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".ctx-menu-note")).toHaveText(shown);
    // repoA has no origin on a known host, so no web page to offer.
    await expect(menu.getByTestId("commit-menu-copy-hash")).toBeVisible();
    await expect(menu.getByTestId("commit-menu-copy-url")).toHaveCount(0);
    await expect(menu.getByTestId("commit-menu-open-url")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // A left click selects the commit, like clicking its row.
    await nodes.nth(2).click();
    await expect(rows.nth(2)).toHaveClass(/selected/);
    await expect(page.getByTestId("commit-detail")).toBeVisible();
  });

  test("uncommitted changes show as a row above HEAD with their diffs", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoP);
    await expect(page.locator('[data-tab-name="repoP"]')).toBeVisible();

    // The working tree sits above HEAD as its own row, drawn apart from
    // history (hollow dashed node, dashed edge), and is not a commit.
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(3);
    const wip = rows.first();
    await expect(wip).toHaveClass(/commit-uncommitted/);
    await expect(wip).toContainText("Uncommitted changes");
    await expect(wip).toContainText("2 files");
    await expect(wip.getByTestId("commit-hash")).toHaveCount(0);
    await expect(rows.nth(1).locator(".badge-head")).toHaveCount(1);
    await expect(page.locator(".repo-count")).toHaveText("2 commits");
    await expect(page.locator(".node-uncommitted")).toHaveCount(1);
    await expect(page.locator(".edge-uncommitted")).toHaveCount(1);
    // Not a commit: no tag/branch menu on the row or its node, and the node
    // names itself rather than showing a hash.
    await wip.click({ button: "right" });
    await expect(page.getByTestId("commit-menu")).toHaveCount(0);
    await page.locator(".node-uncommitted").click({ button: "right" });
    await expect(page.getByTestId("commit-menu")).toHaveCount(0);
    await page.locator(".node-uncommitted").hover();
    await expect(page.getByTestId("node-tip")).toHaveText("Uncommitted changes");
    await page.mouse.move(0, 0);

    // Opening it lists the changed files against HEAD with their counts.
    await wip.click();
    const detail = page.getByTestId("commit-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId("detail-compared")).toContainText("HEAD");
    const files = detail.getByTestId("detail-file");
    await expect(files).toHaveCount(2);
    const note = files.filter({ hasText: "note.txt" });
    await expect(note.locator(".file-status")).toHaveText("M");
    await expect(note.locator(".file-additions")).toHaveText("+1");
    const scratch = files.filter({ hasText: "scratch.txt" });
    await expect(scratch.locator(".file-status")).toHaveText("A");

    // A tracked file diffs against HEAD; the untracked one against nothing.
    await note.click();
    const pane = page.getByTestId("diff-pane");
    await expect(pane).toBeVisible();
    await expect(pane.locator(".diff-line-add")).toContainText("+two");
    await expect(pane.locator(".diff-line-context")).toContainText(" one");
    await page.getByTestId("diff-close").click();
    await detail.getByTestId("diff-all").click();
    const sections = pane.getByTestId("diff-file-section");
    await expect(sections).toHaveCount(2);
    await expect(
      sections.filter({ hasText: "scratch.txt" }).locator(".diff-line-add"),
    ).toContainText("+wip");
    await page.getByTestId("diff-close").click();

    // Restore the served set.
    const repoP = page.locator('[data-repo-name="repoP"]');
    await repoP.hover();
    await repoP.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoP"]')).toHaveCount(0);
  });

  test("a repository lists its linked worktrees and marks their branches", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoQ);
    await expect(page.locator('[data-tab-name="repoQ"]')).toBeVisible();

    // The branch checked out in the linked worktree carries a marker, and
    // its menu refuses a checkout git would refuse too.
    const topic = page.locator(".badge-kind-branch", { hasText: "topic" });
    await expect(topic.getByTestId("badge-worktree")).toHaveCount(1);
    await expect(
      page.locator(".badge-kind-branch", { hasText: "main" }).getByTestId(
        "badge-worktree",
      ),
    ).toHaveCount(0);
    await topic.click({ button: "right" });
    await expect(page.getByTestId("ref-menu-checkout")).toBeDisabled();
    await page.keyboard.press("Escape");

    // The drawer nests the worktree under its repository, naming its branch;
    // opening it attaches it as a view of its own, on that branch.
    const repoQ = page.locator('[data-repo-name="repoQ"]');
    await repoQ.getByTestId("repo-disclosure").click();
    const worktree = page.getByTestId("repo-worktree");
    await expect(worktree).toHaveCount(1);
    await expect(worktree).toContainText("repoQ-wt");
    await expect(worktree.getByTestId("repo-worktree-branch")).toHaveText(
      "topic",
    );
    await worktree.click();
    await expect(page.locator('[data-tab-name="repoQ-wt"]')).toBeVisible();
    await expect(
      page
        .getByTestId("commit-row")
        .filter({ has: page.locator(".badge-head") }),
    ).toContainText("t-1");
    // Seen from the linked worktree, main is the one checked out elsewhere.
    await expect(
      page.locator(".badge-kind-branch", { hasText: "main" }).getByTestId(
        "badge-worktree",
      ),
    ).toHaveCount(1);
    // The attached worktree stays nested: no top-level row of its own.
    await expect(
      page.locator('[data-testid="repo-item"][data-repo-name="repoQ-wt"]'),
    ).toHaveCount(0);

    // Restore the served set: the nested row's menu detaches the worktree.
    await worktree.click({ button: "right" });
    await page.getByTestId("worktree-remove").click();
    await expect(page.locator('[data-tab-name="repoQ-wt"]')).toHaveCount(0);
    await repoQ.hover();
    await repoQ.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoQ"]')).toHaveCount(0);
  });

  test("the drawer filter finds a nested worktree by its branch", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoQ);
    await expect(page.locator('[data-tab-name="repoQ"]')).toBeVisible();
    const filter = page.getByTestId("repo-filter");
    const rows = page.getByTestId("repo-item");
    const worktree = page.getByTestId("repo-worktree");

    // Its parent stays, opened to the worktree, though neither its name
    // nor its path holds the branch.
    await filter.fill("TOPIC");
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute("data-repo-name", "repoQ");
    await expect(worktree).toHaveCount(1);
    await expect(worktree.getByTestId("repo-worktree-branch")).toHaveText(
      "topic",
    );

    // A parent that matches itself keeps its accordion as it was, closed.
    await filter.fill("repoQ");
    await expect(rows).toHaveCount(1);
    await expect(worktree).toHaveCount(0);

    await filter.fill("");
    const repoQ = page.locator('[data-repo-name="repoQ"]');
    await repoQ.hover();
    await repoQ.getByTestId("repo-remove").click();
    await expect(repoQ).toHaveCount(0);
  });

  test("paging keeps the uncommitted row on top and loads every commit", async ({
    page,
  }) => {
    // A one-row page: the first fetch holds the changes row plus HEAD only,
    // and the card must keep asking until both real commits are in.
    await page.addInitScript(() =>
      localStorage.setItem("gitreant-page-size", "1"),
    );
    await page.reload();
    await addRepo(page, fixtures.repoP);
    await expect(page.locator('[data-tab-name="repoP"]')).toBeVisible();

    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toHaveClass(/commit-uncommitted/);
    await expect(rows.nth(1).locator(".badge-head")).toHaveCount(1);
    await expect(rows.nth(2)).toContainText("p-1");
    await expect(page.locator(".repo-count")).toHaveText("2 commits");
    await expect(page.locator(".edge-uncommitted")).toHaveCount(1);

    const repoP = page.locator('[data-repo-name="repoP"]');
    await repoP.hover();
    await repoP.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoP"]')).toHaveCount(0);
  });

  test("a linked worktree and its main worktree share one drawer entry", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoQ);
    await expect(page.locator('[data-tab-name="repoQ"]')).toBeVisible();
    const repoQ = page.locator('[data-repo-name="repoQ"]');
    await repoQ.getByTestId("repo-disclosure").click();
    await page.getByTestId("repo-worktree").click();
    await expect(page.locator('[data-tab-name="repoQ-wt"]')).toBeVisible();

    // Adding the linked worktree by path again dedupes to the same view: it
    // stays a nested row, marked active, never a second top-level entry.
    await addRepo(page, fixtures.repoQWorktree);
    await expect(page.getByTestId("repo-worktree")).toHaveCount(1);
    await expect(page.getByTestId("repo-worktree")).toHaveClass(/active/);
    await expect(
      page.locator('[data-testid="repo-item"][data-repo-name="repoQ-wt"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("tab")).toHaveCount(2);

    // Removing the main worktree promotes the linked one to a top-level
    // row, which nests the (now unlisted) main worktree under itself.
    await repoQ.hover();
    await repoQ.getByTestId("repo-remove").click();
    await expect(page.locator('[data-tab-name="repoQ"]')).toHaveCount(0);
    const linked = page.locator(
      '[data-testid="repo-item"][data-repo-name="repoQ-wt"]',
    );
    await expect(linked).toHaveCount(1);
    await linked.getByTestId("repo-disclosure").click();
    const nestedMain = page.getByTestId("repo-worktree");
    await expect(nestedMain).toHaveCount(1);
    await expect(nestedMain).toContainText("repoQ");
    await expect(nestedMain.getByTestId("repo-worktree-branch")).toHaveText(
      "main · main worktree",
    );

    // Restore the served set.
    await linked.hover();
    await linked.getByTestId("repo-remove").click();
    await expect(linked).toHaveCount(0);
  });

  test("the uncommitted row and worktree rows read in Japanese", async ({
    page,
  }) => {
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("language-ja").click();
    await page.keyboard.press("Escape");
    await addRepo(page, fixtures.repoP);
    await expect(page.locator('[data-tab-name="repoP"]')).toBeVisible();

    const wip = page.getByTestId("commit-row").first();
    await expect(wip).toContainText("未コミットの変更");
    await expect(wip).toContainText("2 ファイル");
    await page.locator(".node-uncommitted").hover();
    await expect(page.getByTestId("node-tip")).toHaveText("未コミットの変更");
    await page.mouse.move(0, 0);
    await wip.click();
    const detail = page.getByTestId("commit-detail");
    await expect(detail.locator(".detail-id")).toHaveText("未コミット");
    await expect(detail.locator(".detail-summary")).toHaveText("未コミットの変更");
    await expect(detail).toContainText("比較対象");

    await addRepo(page, fixtures.repoQ);
    const repoQ = page.locator('[data-repo-name="repoQ"]');
    await expect(repoQ.getByTestId("repo-disclosure")).toHaveAttribute(
      "title",
      "ワークツリーを表示",
    );
    await repoQ.getByTestId("repo-disclosure").click();
    await expect(page.getByTestId("repo-worktree")).toHaveAttribute(
      "title",
      "ワークツリーを開く",
    );
    // The focused pane is showing repoP, so the add did not open a tab.
    await repoQ.click();
    await expect(page.locator('[data-tab-name="repoQ"]')).toBeVisible();
    const topic = page.locator(".badge-kind-branch", { hasText: "topic" });
    await expect(topic.getByTestId("badge-worktree")).toHaveAttribute(
      "title",
      /でチェックアウト中$/,
    );

    // Back to English, and restore the served set.
    await page.getByTestId("settings-toggle").click();
    await page.getByTestId("language-en").click();
    await page.keyboard.press("Escape");
    for (const name of ["repoP", "repoQ"]) {
      const item = page.locator(`[data-repo-name="${name}"]`);
      await item.hover();
      await item.getByTestId("repo-remove").click();
      await expect(item).toHaveCount(0);
    }
  });

  test("the changes panel does not outlive the changes it showed", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoP);
    await expect(page.locator('[data-tab-name="repoP"]')).toBeVisible();
    await page.getByTestId("commit-row").first().click();
    const detail = page.getByTestId("commit-detail");
    await expect(detail.getByTestId("detail-file")).toHaveCount(2);

    // Committing everything in a terminal and reloading leaves no changes
    // row, and the panel that showed the old changes closes with it.
    git(fixtures.repoP, ["add", "."]);
    commit(fixtures.repoP, "p-3");
    await page.getByTestId("reload").click();
    const rows = page.getByTestId("commit-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("p-3");
    await expect(page.locator(".commit-uncommitted")).toHaveCount(0);
    await expect(page.getByTestId("commit-detail")).toHaveCount(0);

    const repoP = page.locator('[data-repo-name="repoP"]');
    await repoP.hover();
    await repoP.getByTestId("repo-remove").click();
    await expect(page.locator('[data-repo-name="repoP"]')).toHaveCount(0);
  });

  test("a branch force-checked-out in a second worktree is marked on HEAD too", async ({
    page,
  }) => {
    // `git worktree add --force` lets two worktrees hold the same branch;
    // the marker then says "also elsewhere" even on the checked-out branch,
    // and the (pointless) checkout is refused like any other.
    const twin = path.join(path.dirname(fixtures.repoQ), "repoQ-twin");
    git(fixtures.repoQ, ["worktree", "add", "-q", "--force", twin, "main"]);
    try {
      await addRepo(page, fixtures.repoQ);
      await expect(page.locator('[data-tab-name="repoQ"]')).toBeVisible();

      const main = page.locator(".badge-kind-branch", { hasText: "main" });
      await expect(main.getByTestId("badge-worktree")).toHaveCount(1);
      await expect(main.getByTestId("badge-worktree")).toHaveAttribute(
        "title",
        /repoQ-twin/,
      );
      await main.click({ button: "right" });
      await expect(page.getByTestId("ref-menu-checkout")).toBeDisabled();
      await page.keyboard.press("Escape");

      const repoQ = page.locator('[data-repo-name="repoQ"]');
      await repoQ.getByTestId("repo-disclosure").click();
      await expect(page.getByTestId("repo-worktree")).toHaveCount(2);
      await repoQ.hover();
      await repoQ.getByTestId("repo-remove").click();
      await expect(repoQ).toHaveCount(0);
    } finally {
      git(fixtures.repoQ, ["worktree", "remove", "--force", twin]);
    }
  });

  test("a line-ending conversion is named and drawn, not shown as a rewrite", async ({
    page,
  }) => {
    await addRepo(page, fixtures.repoR);
    await expect(page.locator('[data-tab-name="repoR"]')).toBeVisible();

    // The committed conversion: the file list names it apart from the edit.
    await page.getByTestId("commit-row").filter({ hasText: "convert" }).click();
    const detail = page.getByTestId("commit-detail");
    const eolFile = detail.getByTestId("detail-file").filter({ hasText: "eol.txt" });
    const textFile = detail.getByTestId("detail-file").filter({ hasText: "text.txt" });
    await expect(eolFile.getByTestId("file-eol")).toHaveText("Line endings only");
    await expect(textFile.getByTestId("file-eol")).toHaveCount(0);

    // Its diff says which way it went and marks the ending on every line.
    await eolFile.click();
    const pane = page.getByTestId("diff-pane");
    await expect(pane.getByTestId("diff-eol")).toHaveText(
      "Line endings only: LF → CRLF",
    );
    await expect(pane.getByTestId("eol-mark")).toHaveCount(4);
    await expect(pane.getByTestId("eol-mark").last()).toHaveText("␍␊");
    // A real edit carries no such marks.
    await page.getByTestId("diff-close").click();
    await textFile.click();
    await expect(pane.getByTestId("diff-eol")).toHaveCount(0);
    await expect(pane.getByTestId("eol-mark")).toHaveCount(0);
    await page.getByTestId("diff-close").click();

    // The working tree's conversion reads the same way.
    await page.locator(".commit-uncommitted").click();
    const wip = detail.getByTestId("detail-file").filter({ hasText: "text.txt" });
    await expect(wip.getByTestId("file-eol")).toHaveText("Line endings only");
    await wip.click();
    await expect(pane.getByTestId("diff-eol")).toHaveText(
      "Line endings only: LF → CRLF",
    );
    await page.getByTestId("diff-close").click();

    // A binary file is named so in place of its line counts.
    const binaryLabel = (file: Locator) => file.getByTestId("file-binary");
    const blob = detail
      .getByTestId("detail-file")
      .filter({ hasText: "blob.bin" });
    await expect(binaryLabel(blob)).toHaveText("Binary");
    await expect(blob.locator(".file-counts")).toHaveCount(0);
    await expect(binaryLabel(wip)).toHaveCount(0);
    await page.getByTestId("commit-row").filter({ hasText: "convert" }).click();
    const data = detail
      .getByTestId("detail-file")
      .filter({ hasText: "data.bin" });
    await expect(binaryLabel(data)).toHaveText("Binary");
    await expect(data.locator(".file-counts")).toHaveCount(0);
    await expect(binaryLabel(textFile)).toHaveCount(0);
    await page.getByTestId("commit-row").filter({ hasText: "r-1" }).click();
    await page
      .getByTestId("commit-row")
      .filter({ hasText: "convert" })
      .click({ button: "right" });
    await page.getByTestId("commit-menu-compare").click();
    const compared = page
      .getByTestId("compare-file")
      .filter({ hasText: "data.bin" });
    await expect(binaryLabel(compared)).toHaveText("Binary");
    await expect(compared.locator(".file-counts")).toHaveCount(0);

    const repoR = page.locator('[data-repo-name="repoR"]');
    await repoR.hover();
    await repoR.getByTestId("repo-remove").click();
    await expect(repoR).toHaveCount(0);
  });

  test("browse button adds the folder returned by the picker", async ({
    page,
  }) => {
    // The native folder dialog can't be driven in a headless run, so stub the
    // pick endpoint and verify the browse -> add wiring end to end.
    await page.route("**/api/pick", (route) =>
      route.fulfill({ json: { path: fixtures.repoC } }),
    );

    await page.getByTestId("drawer-add").click();
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
