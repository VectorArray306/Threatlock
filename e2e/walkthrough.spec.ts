import { test, expect, type Page } from "@playwright/test";
async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("stepwise local protection and deduplicated metadata survive reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A safer conversation starts here." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "How it works" }),
  ).toBeVisible();
  await noPageOverflow(page);
  await page.screenshot({
    path: `review-screenshots/${testInfo.project.name}-simulator.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /The urgent IT request/ }).click();
  await expect(
    page.getByText("Send your recovery code here so I can keep you signed in."),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next message" }).click();
  await expect(
    page.getByText("Send your recovery code here so I can keep you signed in."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check this message" }).click();
  await expect(
    page.getByRole("button", { name: /Override warning & send/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check this message" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("threatlock:v3")!).incidents.length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: /Override warning & send/ }).click();
  await page.getByRole("button", { name: "Security dashboard" }).click();
  await expect(
    page.getByRole("cell", { name: "CREDENTIAL REQUEST" }),
  ).toHaveCount(2);
  await noPageOverflow(page);
  await page.screenshot({
    path: `review-screenshots/${testInfo.project.name}-live-dashboard.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await page.getByRole("button", { name: "Security dashboard" }).click();
  await expect(
    page.getByRole("cell", { name: "CREDENTIAL REQUEST" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Simulator" }).click();
  await page
    .getByRole("button", { name: /A screenshot tells a story/ })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Fictional incoming attachment: Account recovery screenshot.png",
    }),
  ).toBeVisible();
  await noPageOverflow(page);
  await page.screenshot({
    path: `review-screenshots/${testInfo.project.name}-incoming-screenshot.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("draft preview stays separate from global publication and previous-version restore", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message draft" })
    .fill("DEMO-SECRET-7842");
  await page.getByRole("button", { name: "Rules & policies" }).click();
  await page.getByRole("switch", { name: "Enable Secret demo token" }).click();
  await page
    .getByRole("textbox", { name: "Policy preview draft" })
    .fill("DEMO-SECRET-7842");
  await page.getByRole("button", { name: "Run preview" }).click();
  await expect(page.getByText("Draft policy passed.")).toBeVisible();
  await page.getByRole("button", { name: "Simulator" }).click();
  await page.getByRole("button", { name: "Check this message" }).click();
  await expect(page.getByText("Sensitive data caught.")).toBeVisible();
  await page.getByRole("button", { name: "Rules & policies" }).click();
  await page.getByRole("button", { name: "Publish policy v2" }).click();
  await expect(page.getByRole("heading", { name: "Policy v2" })).toBeVisible();
  await page.getByRole("button", { name: "Simulator" }).click();
  await page.getByRole("button", { name: "Check this message" }).click();
  await expect(page.getByText("Context is unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Rules & policies" }).click();
  await page.getByText("Inspect previous published revision v1").click();
  await noPageOverflow(page);
  await page.screenshot({
    path: `review-screenshots/${testInfo.project.name}-rules.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Restore v1 as v3" }).click();
  await expect(page.getByRole("heading", { name: "Policy v3" })).toBeVisible();
  await page.getByRole("button", { name: "Simulator" }).click();
  await page.getByRole("button", { name: "Check this message" }).click();
  await expect(page.getByText("Sensitive data caught.")).toBeVisible();
});
test("seeded three-persona history is clearly separated and filterable", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Security dashboard" }).click();
  await page.getByRole("button", { name: "Synthetic history (12)" }).click();
  for (const name of ["Jamie Davis", "Alex Chen", "Priya Rao"])
    await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Severity distribution · 12 events" }),
  ).toBeVisible();
  await noPageOverflow(page);
  await page.screenshot({
    path: `review-screenshots/${testInfo.project.name}-synthetic-history.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Inspect a fictional persona").selectOption("alex");
  await expect(
    page.getByRole("heading", { name: "Severity distribution · 4 events" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Live session (0)" }).click();
  await expect(
    page.getByRole("heading", { name: "No events yet" }),
  ).toBeVisible();
});
