import { test, expect } from "@playwright/test";
import { login } from "./auth.setup";

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/todos/reset");
  await request.post("/api/account/reset");
  await login(page);
});

test("app loads with initial todos and count", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.locator(".todo-item")).toHaveCount(3);
  await expect(page.locator(".todo-count")).toHaveText("2 items left");
});

test("add todo", async ({ page }) => {
  await page.getByPlaceholder("What needs to be done?").fill("Write E2E tests");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.locator(".todo-item")).toHaveCount(4);
  await expect(page.locator(".todo-text").last()).toHaveText("Write E2E tests");
  await expect(page.getByPlaceholder("What needs to be done?")).toHaveValue("");
  await expect(page.locator(".todo-count")).toHaveText("3 items left");
});

test("toggle todo", async ({ page }) => {
  const secondTodo = page.locator(".todo-item").nth(1);
  await secondTodo.getByRole("checkbox").click();

  await expect(secondTodo).toHaveClass(/completed/);
  await expect(page.locator(".todo-count")).toHaveText("1 item left");

  await secondTodo.getByRole("checkbox").click();
  await expect(secondTodo).not.toHaveClass(/completed/);
  await expect(page.locator(".todo-count")).toHaveText("2 items left");
});

test("edit todo", async ({ page }) => {
  const firstTodoText = page.locator(".todo-text").first();
  await firstTodoText.dblclick();

  const editInput = page.locator(".edit-input").first();
  await expect(editInput).toBeVisible();
  await editInput.fill("Learn snapstate deeply");
  await editInput.press("Enter");

  await expect(page.locator(".todo-text").first()).toHaveText(
    "Learn snapstate deeply"
  );
});

test("edit todo twice", async ({ page }) => {
  const firstTodoText = page.locator(".todo-text").first();

  // First edit
  await firstTodoText.dblclick();
  const editInput = page.locator(".edit-input").first();
  await editInput.fill("First edit");
  await editInput.press("Enter");
  await expect(page.locator(".todo-text").first()).toHaveText("First edit");

  // Second edit on same item
  await page.locator(".todo-text").first().dblclick();
  const editInput2 = page.locator(".edit-input").first();
  await expect(editInput2).toBeVisible();
  await editInput2.fill("Second edit");
  await editInput2.press("Enter");
  await expect(page.locator(".todo-text").first()).toHaveText("Second edit");
});

test("edit cancel with Escape", async ({ page }) => {
  const firstTodoText = page.locator(".todo-text").first();
  await firstTodoText.dblclick();

  const editInput = page.locator(".edit-input").first();
  await editInput.clear();
  await editInput.fill("Something else");
  await editInput.press("Escape");

  await expect(page.locator(".todo-text").first()).toHaveText(
    "Learn snapstate"
  );
});

test("delete todo", async ({ page }) => {
  const firstTodo = page.locator(".todo-item").first();
  await firstTodo.locator(".delete-btn").click();

  await expect(page.locator(".todo-item")).toHaveCount(2);
  await expect(page.locator(".todo-count")).toHaveText("2 items left");
});

test("filter: active", async ({ page }) => {
  await page.getByRole("button", { name: "active" }).click();

  await expect(page.locator(".todo-item")).toHaveCount(2);
  await expect(page.locator(".todo-text").first()).toHaveText(
    "Build a todo app"
  );
});

test("filter: completed", async ({ page }) => {
  await expect(page.locator(".todo-item")).toHaveCount(3);
  await page
    .getByRole("button", { name: "completed", exact: true })
    .click();

  await expect(page.locator(".todo-item")).toHaveCount(1);
  await expect(page.locator(".todo-text").first()).toHaveText(
    "Learn snapstate"
  );
});

test("filter: all", async ({ page }) => {
  await page.getByRole("button", { name: "active" }).click();
  await expect(page.locator(".todo-item")).toHaveCount(2);

  await page.getByRole("button", { name: "all" }).click();
  await expect(page.locator(".todo-item")).toHaveCount(3);
});

test("clear completed", async ({ page }) => {
  await page.getByRole("button", { name: "Clear completed" }).click();

  await expect(page.locator(".todo-item")).toHaveCount(2);
  await expect(page.locator(".todo-count")).toHaveText("2 items left");
});
