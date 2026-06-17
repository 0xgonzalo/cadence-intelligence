import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Signed-in happy path: Radar → open an opportunity → trigger generate → see
 * the Content Package preview.
 *
 * Auth: point E2E_STORAGE_STATE at a Playwright storageState JSON captured for
 * an allow-listed, signed-in user (magic-link auth can't be driven headlessly).
 * Without it the suite skips rather than failing, so CI stays green without
 * secrets. Run real Supabase; the only thing mocked is the app's own
 * /api/generate route — the generate step calls AI/partner upstreams
 * server-side, so intercepting it at the browser keeps the flow deterministic.
 */
const STORAGE = process.env.E2E_STORAGE_STATE;
const authed = Boolean(STORAGE && fs.existsSync(STORAGE));

test.describe("content pipeline (signed-in)", () => {
  test.skip(
    !authed,
    "Set E2E_STORAGE_STATE to a signed-in storageState JSON to run this flow.",
  );
  test.use({ storageState: STORAGE });

  test("radar → opportunity → generate → package preview", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({ json: { data: { briefs: 1 } } }),
    );

    await page.goto("/radar");
    await expect(page.getByRole("heading", { name: /Rising/ })).toBeVisible();

    const opps = page.locator('a[href^="/engine/"]');
    const count = await opps.count();
    test.skip(
      count === 0,
      "No seeded opportunities for this account — seed an artist and run /api/signal/poll first.",
    );

    await opps.first().click();
    await expect(page).toHaveURL(/\/engine\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Content Package")).toBeVisible();

    const generate = page.getByRole("button", {
      name: /Generate brief|Regenerate/,
    });
    const dispatched = page.waitForRequest("**/api/generate");
    await generate.click();
    await dispatched;

    await expect(page.getByText(/Generation failed/)).toHaveCount(0);
  });
});
