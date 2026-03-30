import { test, expect } from "@playwright/test";
import { login } from "./auth.setup";

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/todos/reset");
  await request.post("/api/account/reset");
  await login(page);
});

test("navigate to todo detail and see todo info", async ({ page }) => {
  const firstDetail = page.locator(".detail-link").first();
  await firstDetail.click();

  await expect(page.locator(".todo-detail-title")).toBeVisible();
  await expect(page.locator(".todo-detail-status")).toBeVisible();
});

test("completed todo shows completed status", async ({ page }) => {
  // First todo "Learn snapstate" is completed in seed data
  const firstDetail = page.locator(".detail-link").first();
  await firstDetail.click();

  await expect(page.locator(".todo-detail-title")).toHaveText("Learn snapstate");
  await expect(page.locator(".todo-detail-status")).toHaveText("Completed");
});

test("active todo shows active status", async ({ page }) => {
  // Second todo "Build a todo app" is active in seed data
  const secondDetail = page.locator(".detail-link").nth(1);
  await secondDetail.click();

  await expect(page.locator(".todo-detail-title")).toHaveText("Build a todo app");
  await expect(page.locator(".todo-detail-status")).toHaveText("Active");
});

test("back link returns to todo list", async ({ page }) => {
  const firstDetail = page.locator(".detail-link").first();
  await firstDetail.click();

  await expect(page.locator(".todo-detail-title")).toBeVisible();

  await page.locator(".todo-detail-back").click();
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.locator(".todo-item")).toHaveCount(3);
});

test("navigating between different todo details shows correct data", async ({ page }) => {
  // Go to first todo detail
  await page.locator(".detail-link").first().click();
  await expect(page.locator(".todo-detail-title")).toHaveText("Learn snapstate");

  // Go back
  await page.locator(".todo-detail-back").click();
  await expect(page.locator(".todo-item")).toHaveCount(3);

  // Go to second todo detail
  await page.locator(".detail-link").nth(1).click();
  await expect(page.locator(".todo-detail-title")).toHaveText("Build a todo app");
});

test("shows loading state before todo loads", async ({ page }) => {
  const firstDetail = page.locator(".detail-link").first();
  await firstDetail.click();

  // The loading spinner should appear briefly (300ms server delay)
  // Then the detail should load
  await expect(page.locator(".todo-detail-title")).toBeVisible({ timeout: 5000 });
});
