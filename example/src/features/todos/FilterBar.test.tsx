import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../stores", () => ({
  todoStore: {
    connect: (c: any) => c,
    setFilter: vi.fn(),
    clearCompleted: vi.fn(),
  },
}));

import { FilterBar } from "./FilterBar";
import { todoStore } from "../../stores";

const C = FilterBar as any;

describe("FilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all three filter buttons", () => {
    const { container } = render(<C filter="all" />);
    const buttons = container.querySelectorAll(".filter-buttons button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toBe("all");
    expect(buttons[1].textContent).toBe("active");
    expect(buttons[2].textContent).toBe("completed");
  });

  it("marks the current filter as active", () => {
    const { container } = render(<C filter="active" />);
    const buttons = container.querySelectorAll(".filter-buttons button");
    expect(buttons[0].className).toBe("");
    expect(buttons[1].className).toBe("active");
    expect(buttons[2].className).toBe("");
  });

  it("calls setFilter when a filter button is clicked", async () => {
    const { container } = render(<C filter="all" />);
    const buttons = container.querySelectorAll(".filter-buttons button");
    await userEvent.click(buttons[2]);
    expect(todoStore.setFilter).toHaveBeenCalledWith("completed");
  });

  it("calls clearCompleted when clear button is clicked", async () => {
    render(<C filter="all" />);
    await userEvent.click(screen.getByText("Clear completed"));
    expect(todoStore.clearCompleted).toHaveBeenCalled();
  });
});
