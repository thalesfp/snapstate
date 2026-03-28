import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("../../stores", () => ({
  todoStore: {
    connect: vi.fn(() => () => null),
    toggleTodo: vi.fn().mockResolvedValue(undefined),
    editTodo: vi.fn().mockResolvedValue(undefined),
    removeTodo: vi.fn().mockResolvedValue(undefined),
  },
}));

import { TodoItemInner } from "./TodoItem";
import { todoStore } from "../../stores";
import { asyncStatus } from "snapstate/react";

const todo = { id: "1", text: "Test todo", completed: false };
const idle = { status: asyncStatus("idle"), error: null };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("TodoItemInner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders todo text", () => {
    render(<TodoItemInner todo={todo} editState={idle} />, { wrapper });
    expect(screen.getByText("Test todo")).toBeTruthy();
  });

  it("applies completed class when todo is completed", () => {
    const { container } = render(
      <TodoItemInner todo={{ ...todo, completed: true }} editState={idle} />,
      { wrapper },
    );
    expect(container.querySelector("li")!.className).toContain("completed");
  });

  it("does not apply completed class when todo is active", () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    expect(container.querySelector("li")!.className).not.toContain("completed");
  });

  it("checks the checkbox when completed", () => {
    const { container } = render(
      <TodoItemInner todo={{ ...todo, completed: true }} editState={idle} />,
      { wrapper },
    );
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("unchecks the checkbox when active", () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("calls toggleTodo on checkbox click", async () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    const checkbox = container.querySelector('input[type="checkbox"]')!;
    await userEvent.click(checkbox);
    expect(todoStore.toggleTodo).toHaveBeenCalledWith("1");
  });

  it("calls removeTodo on delete button click", async () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    await userEvent.click(container.querySelector(".delete-btn")!);
    expect(todoStore.removeTodo).toHaveBeenCalledWith("1");
  });

  it("enters edit mode on double-click", async () => {
    render(<TodoItemInner todo={todo} editState={idle} />, { wrapper });
    await userEvent.dblClick(screen.getByText("Test todo"));
    expect(screen.getByDisplayValue("Test todo")).toBeTruthy();
  });

  it("calls editTodo on Enter in edit mode", async () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    await userEvent.dblClick(screen.getByText("Test todo"));
    const editInput = container.querySelector(".edit-input") as HTMLInputElement;
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "Updated{Enter}");
    expect(todoStore.editTodo).toHaveBeenCalledWith("1", "Updated");
  });

  it("cancels editing on Escape", async () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    await userEvent.dblClick(screen.getByText("Test todo"));
    const editInput = container.querySelector(".edit-input") as HTMLInputElement;
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "Changed{Escape}");
    expect(container.querySelector(".edit-input")).toBeNull();
    expect(screen.getByText("Test todo")).toBeTruthy();
  });

  it("exits edit mode after saving", async () => {
    const { container } = render(
      <TodoItemInner todo={todo} editState={idle} />,
      { wrapper },
    );
    await userEvent.dblClick(screen.getByText("Test todo"));
    const editInput = container.querySelector(".edit-input") as HTMLInputElement;
    await userEvent.type(editInput, "{Enter}");
    await waitFor(() => {
      expect(container.querySelector(".edit-input")).toBeNull();
    });
  });
});
