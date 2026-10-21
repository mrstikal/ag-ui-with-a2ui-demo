import { expect, test } from "@playwright/test";

async function waitForIdle(page: import("@playwright/test").Page) {
  await expect(
    page.locator('[data-copilot-running="false"]'),
  ).toBeAttached();
  await expect(
    page.locator("header").getByText("IDLE", { exact: true }),
  ).toBeVisible();
}

test("renders a fixture form, validates, reviews by keyboard, and resets", async ({
  page,
}) => {
  await page.goto("/");
  const chat = page.locator("main section").first();
  await expect(
    page.getByRole("heading", { name: "Adaptive Request Builder" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Login bug" }).click();
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toBeVisible();
  await waitForIdle(page);

  const emptyReview = page.getByRole("button", { name: "Review request" });
  await emptyReview.focus();
  await expect(emptyReview).toBeFocused();
  await emptyReview.press("Enter");
  await expect(chat.getByText(/Validation failed/i).first()).toBeVisible();
  await expect(chat.getByText(/Bug summary is required/i).first()).toBeVisible();
  await expect(page.locator("header").getByText("IDLE", { exact: true }))
    .toBeVisible();

  await page.getByRole("textbox", { name: "Bug summary" }).fill("Safari sign-out");
  await page
    .getByRole("textbox", { name: "Steps to reproduce" })
    .fill("Sign in with Safari and observe the session ending.");
  await page.getByRole("button", { name: "High" }).click();

  const review = page.getByRole("button", { name: "Review request" });
  await review.focus();
  await expect(review).toBeFocused();
  await review.press("Enter");
  await expect(chat.getByText("Reviewed at revision 1.").first()).toBeVisible();
  await waitForIdle(page);
  await expect(
    page.getByRole("button", { name: "Submit demo request" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "New request" }).click();
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toHaveCount(0);
  await expect(chat.getByText("Reviewed at revision 1.")).toHaveCount(0);
  await expect(page.getByText("Try an example")).toBeVisible();
});

test("keeps 375px layout usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const overflowBefore = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowBefore).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Login bug" }).click();
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Bug summary" }))
    .toBeVisible();

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowAfter).toBeLessThanOrEqual(0);
});

test("tab order moves from New request to the example buttons", async ({
  page,
}) => {
  await page.goto("/");
  const newRequest = page.getByRole("button", { name: "New request" });
  await newRequest.focus();
  await expect(newRequest).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Login bug" })).toBeFocused();
});

test("shows a transport failure and recovers with New request", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("header").getByText("FIXTURE", { exact: true }),
  ).toBeVisible();

  await page.route("**/api/copilotkit**", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "POST" && !url.includes("/info")) {
      await route.fulfill({
        status: 502,
        contentType: "text/plain",
        body: "bridge unavailable",
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Login bug" }).click();
  await expect(page.getByText("Run or transport error.")).toBeVisible();
  await expect(
    page.locator("header").getByText("ERROR", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("header").getByText("FIXTURE", { exact: true }),
  ).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "New request" })
    .click();
  await expect(page.getByText("Try an example")).toBeVisible();
  await expect(page.getByText("Run or transport error.")).toHaveCount(0);
  await expect(
    page.locator("header").getByText("FIXTURE", { exact: true }),
  ).toBeVisible();

  await page.unroute("**/api/copilotkit**");
  await page.getByRole("button", { name: "Login bug" }).click();
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toBeVisible();
});
