import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../stores", () => ({
  todoStore: { connect: (c: any) => c },
}));

vi.mock("./TodoItem", () => ({
  TodoItem: ({ todo }: { todo: { id: string; text: string } }) => (
    <li>{todo.text}</li>
  ),
}));

import { TodoList } from "./TodoList";

const C = TodoList as any;

describe("TodoList", () => {
  it("shows empty message when there are no todos", () => {
    render(<C todos={[]} filter="all" />);
    expect(screen.getByText("No todos to show")).toBeTruthy();
  });

  it("renders each todo", () => {
    const todos = [
      { id: "1", text: "First", completed: false },
      { id: "2", text: "Second", completed: true },
    ];
    render(<C todos={todos} filter="all" />);
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("renders a ul element for non-empty list", () => {
    const todos = [{ id: "1", text: "Task", completed: false }];
    const { container } = render(<C todos={todos} filter="all" />);
    expect(container.querySelector("ul.todo-list")).toBeTruthy();
  });

  it("filters to active todos only", () => {
    const todos = [
      { id: "1", text: "Active", completed: false },
      { id: "2", text: "Done", completed: true },
    ];
    render(<C todos={todos} filter="active" />);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("filters to completed todos only", () => {
    const todos = [
      { id: "1", text: "Active", completed: false },
      { id: "2", text: "Done", completed: true },
    ];
    render(<C todos={todos} filter="completed" />);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
  });
});
