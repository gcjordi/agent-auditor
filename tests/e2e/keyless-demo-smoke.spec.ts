import { expect, test } from "@playwright/test";

test("runs the complete deterministic Demo audit without a key", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "See how an AI agent fails—and how to fix it." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Run Demo Audit" }).first().click();

  await expect(page).toHaveURL(/\/audits\/demo$/u);
  await expect(
    page.getByRole("heading", { name: "Running behavioral security audit" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Complete audit report" })).toBeVisible({
    timeout: 10_000,
  });

  await expect(page.getByText("62", { exact: true })).toBeVisible();
  await expect(page.getByText("HIGH risk", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Category scores" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavioral tests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommended guardrails" })).toBeVisible();
  await expect(page.getByText("Evidence E-01", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run audit again" }).click();
  await expect(
    page.getByRole("heading", { name: "Running behavioral security audit" }),
  ).toBeVisible();
});
