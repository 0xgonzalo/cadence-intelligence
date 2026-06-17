import { test, expect } from "@playwright/test";

test("unauthenticated root redirects to /auth/login", async ({ page }) => {
  const r = await page.goto("/");
  expect(r?.url()).toMatch(/\/auth\/login/);
});

test("unauthenticated /radar requires auth", async ({ page }) => {
  await page.goto("/radar");
  await expect(page).toHaveURL(/\/auth\/login/);
});
