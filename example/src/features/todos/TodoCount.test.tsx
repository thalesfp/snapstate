import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../stores", () => ({
  todoStore: { connect: (c: any) => c },
}));

import { TodoCount } from "./TodoCount";

const C = TodoCount as any;

describe("TodoCount", () => {
  it("shows singular form for 1 item", () => {
    render(<C todos={[{ id: "1", text: "A", completed: false }]} />);
    expect(screen.getByText("1 item left")).toBeTruthy();
  });

  it("shows plural form for 0 items", () => {
    render(<C todos={[]} />);
    expect(screen.getByText("0 items left")).toBeTruthy();
  });

  it("shows plural form for multiple items", () => {
    const todos = [
      { id: "1", text: "A", completed: false },
      { id: "2", text: "B", completed: false },
      { id: "3", text: "C", completed: true },
      { id: "4", text: "D", completed: false },
      { id: "5", text: "E", completed: false },
      { id: "6", text: "F", completed: false },
    ];
    render(<C todos={todos} />);
    expect(screen.getByText("5 items left")).toBeTruthy();
  });
});
