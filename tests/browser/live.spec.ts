import { expect, test } from "@playwright/test";

const CHAT_PLACEHOLDER = "Describe your request, or pick an example";
const hasLiveCredentials = Boolean(
  process.env.MODEL_ID?.trim() && process.env.MODEL_API_KEY?.trim(),
);

test.skip(
  !hasLiveCredentials,
  "Live browser suite needs MODEL_ID and MODEL_API_KEY (opt-in).",
);

test.describe.configure({ mode: "serial" });

async function chatInput(page: import("@playwright/test").Page) {
  return page.getByPlaceholder(CHAT_PLACEHOLDER);
}

async function waitForForm(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toBeVisible();
  await expect(page.getByText(/A2UI generation failed/i)).toHaveCount(0);
}

async function waitForIdle(page: import("@playwright/test").Page) {
  await expect(
    page.locator('[data-copilot-running="false"]'),
  ).toBeAttached();
}

async function reset(page: import("@playwright/test").Page) {
  await waitForIdle(page);
  await page.getByRole("button", { name: "New request" }).click();
  await expect(
    page.getByRole("button", { name: "Review request" }),
  ).toHaveCount(0);
}

test("three examples and one custom request render model-composed forms", async ({
  page,
}) => {
  await page.goto("/");

  for (const name of ["Login bug", "Dashboard feature", "Project review meeting"]) {
    await page.getByRole("button", { name }).click();
    await waitForForm(page);
    await expect(page.locator("main input, main textarea").first()).toBeVisible();
    await reset(page);
  }

  await (await chatInput(page)).fill(
    "Create a request form for ordering a new laptop and tracking its approval.",
  );
  await (await chatInput(page)).press("Enter");
  await waitForForm(page);
  await reset(page);
});

test("review, priority/justification update, re-review, submit, and reset", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Login bug" }).click();
  await waitForForm(page);

  const editable = page.locator("main input, main textarea");
  await editable.nth(0).fill("Safari sign-out bug");
  await editable
    .nth(1)
    .fill("Safari users are signed out immediately after login.");

  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByText(/Reviewed at revision \d+\./)).toBeVisible();
  await waitForIdle(page);

  await (await chatInput(page)).fill(
    "Make this a high-priority request and add a short justification. Keep the existing fields.",
  );
  await (await chatInput(page)).press("Enter");
  await expect(page.getByText(/Updated the form at revision \d+/)).toBeVisible();
  await waitForIdle(page);
  await expect(page.getByText(/Priority/i).first()).toBeVisible();
  await expect(page.getByText(/Justification/i).first()).toBeVisible();

  const justification = page
    .getByRole("textbox", { name: /justification/i })
    .first();
  await justification.fill(
    "Safari loses sessions right after login and blocks the support team.",
  );

  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByText(/Reviewed at revision \d+\./)).toBeVisible();
  await waitForIdle(page);

  const submit = page.getByRole("button", { name: "Submit demo request" });
  await submit.focus();
  await expect(submit).toBeFocused();
  await submit.press("Enter");
  await expect(
    page.getByText("Demo only - nothing was sent.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit demo request" }),
  ).toHaveCount(0);

  await reset(page);
  await expect(page.getByText("Try an example")).toBeVisible();
});
