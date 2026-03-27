import { test, expect } from "@playwright/test";
import { login } from "./auth.setup";

test.beforeEach(async ({ request }) => {
  await request.post("/api/todos/reset");
  await request.post("/api/account/reset");
});

test("shows login form when unauthenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("login with valid creds shows todos and user name", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.locator(".user-info")).toHaveText("Demo User");
  await expect(page.locator(".todo-item")).toHaveCount(3);
});

test("login with invalid creds shows error", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("wrong@example.com");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.locator(".login-error")).toHaveText("Invalid credentials");
});

test("logout returns to login form", async ({ page }) => {
  await login(page);
  await expect(page.locator(".user-info")).toHaveText("Demo User");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});
