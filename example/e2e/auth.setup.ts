import type { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").waitFor();
  await page.getByRole("button", { name: "Login" }).click();
  await page.locator(".todo-item").first().waitFor();
}
