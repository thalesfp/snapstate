import { test, expect } from "@playwright/test";
import { login } from "./auth.setup";

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/todos/reset");
  await request.post("/api/account/reset");
  await login(page);
});

test("navigate to profile and see form with current data", async ({ page }) => {
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByTestId("profile-name")).toHaveValue("Demo User");
  await expect(page.getByTestId("profile-email")).toHaveValue("demo@example.com");
  await expect(page.getByTestId("profile-notifications")).toBeChecked();
  await expect(page.getByTestId("profile-theme")).toHaveValue("system");
});

test("update name reflects in header and form", async ({ page }) => {
  await page.getByRole("link", { name: "Profile" }).click();

  await page.getByTestId("profile-name").clear();
  await page.getByTestId("profile-name").fill("New Name");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".profile-success")).toHaveText("Profile updated!");
  await expect(page.getByTestId("profile-name")).toHaveValue("New Name");
  await expect(page.locator(".user-info")).toHaveText("New Name");
});

test("toggle notifications and change theme, then save", async ({ page }) => {
  await page.getByRole("link", { name: "Profile" }).click();

  await page.getByTestId("profile-notifications").uncheck();
  await page.getByTestId("profile-theme").selectOption("dark");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".profile-success")).toHaveText("Profile updated!");
  await expect(page.getByTestId("profile-notifications")).not.toBeChecked();
  await expect(page.getByTestId("profile-theme")).toHaveValue("dark");
});

test("back to todos still works", async ({ page }) => {
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Todos" }).click();
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.locator(".todo-item")).toHaveCount(3);
});
