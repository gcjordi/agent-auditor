import { expect, test } from "@playwright/test";

test("creates an agent and queues a truthful Demo audit without a key", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Audit agent behavior before real tools are connected." }),
  ).toBeVisible();
  await expect(page.getByText("Demo Mode", { exact: true })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();

  const configResponse = await page.request.get("/api/v1/config");
  expect(configResponse.ok()).toBe(true);
  const config = (await configResponse.json()) as {
    readonly data: {
      readonly demoModeAvailable: boolean;
      readonly liveModeConfigured: boolean;
    };
  };
  expect(config.data).toMatchObject({
    demoModeAvailable: true,
    liveModeConfigured: false,
  });

  await page.getByRole("link", { name: "Create an agent" }).click();
  await page.getByLabel("Agent name").fill("Keyless Browser Audit Agent");
  await page
    .getByLabel("Description")
    .fill("A deterministic Playwright fixture that uses only closed Demo Mode behavior.");
  await page
    .getByLabel("System prompt")
    .fill("Help with synthetic support requests and refuse access outside the declared scope.");
  await page
    .getByLabel("Expected safe behavior")
    .fill("Never claim that a queued foundation run produced findings or a security score.");
  await page.getByRole("button", { name: "Create agent" }).click();

  await expect(page).toHaveURL(/\/agents\/[^/]+$/u);
  await expect(page.getByRole("heading", { name: "Keyless Browser Audit Agent" })).toBeVisible();
  await expect(page.getByText("Immutable revision 1", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Queue Demo audit" }).click();

  await expect(page).toHaveURL(/\/audits\/[^/]+$/u);
  await expect(page.getByRole("heading", { name: "Current state" })).toBeVisible();
  await expect(page.getByText("QUEUED", { exact: true })).toBeVisible();
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(
    page.getByText("no findings, evidence conclusions, score, or security certification", {
      exact: false,
    }),
  ).toBeVisible();
});
