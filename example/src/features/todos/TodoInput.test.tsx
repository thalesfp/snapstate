import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { asyncStatus } from "snapstate/react";

let mockInputEl: HTMLInputElement | null = null;

vi.mock("../../stores", () => ({
  todoStore: {
    connect: vi.fn(() => () => null),
    addTodo: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({
      status: { value: "idle", isIdle: true, isLoading: false, isReady: false, isError: false },
      error: null,
    }),
  },
  todoInputStore: {
    register: vi.fn((field: string) => ({
      ref: (el: HTMLInputElement | null) => { mockInputEl = el; },
      name: field,
      defaultValue: "",
      onBlur: () => {},
    })),
    getValue: vi.fn(() => mockInputEl?.value ?? ""),
    clear: vi.fn(() => { if (mockInputEl) mockInputEl.value = ""; }),
  },
}));

import { TodoInputInner } from "./TodoInput";
import { todoStore } from "../../stores";

type OpState = { status: ReturnType<typeof asyncStatus>; error: string | null };
const idle: OpState = { status: asyncStatus("idle"), error: null };
const loading: OpState = { status: asyncStatus("loading"), error: null };
const errorState: OpState = { status: asyncStatus("error"), error: "Something went wrong" };

describe("TodoInputInner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInputEl = null;
    (todoStore.getStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      status: asyncStatus("idle"),
      error: null,
    });
  });

  it("renders input and submit button", () => {
    render(<TodoInputInner addState={idle} />);
    expect(screen.getByPlaceholderText("What needs to be done?")).toBeTruthy();
    expect(screen.getByText("Add")).toBeTruthy();
  });

  it("disables input and button while adding", () => {
    render(<TodoInputInner addState={loading} />);
    const input = screen.getByPlaceholderText("What needs to be done?") as HTMLInputElement;
    const button = screen.getByText("Adding...");
    expect(input.disabled).toBe(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows button text as 'Adding...' while loading", () => {
    render(<TodoInputInner addState={loading} />);
    expect(screen.getByText("Adding...")).toBeTruthy();
  });

  it("shows error message", () => {
    render(<TodoInputInner addState={errorState} />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("does not show error when idle", () => {
    const { container } = render(<TodoInputInner addState={idle} />);
    expect(container.querySelector(".error")).toBeNull();
  });

  it("calls addTodo on form submit", async () => {
    render(<TodoInputInner addState={idle} />);
    await userEvent.type(
      screen.getByPlaceholderText("What needs to be done?"),
      "Buy milk",
    );
    await userEvent.click(screen.getByText("Add"));
    expect(todoStore.addTodo).toHaveBeenCalledWith("Buy milk");
  });

  it("clears input after successful add", async () => {
    render(<TodoInputInner addState={idle} />);
    const input = screen.getByPlaceholderText("What needs to be done?") as HTMLInputElement;
    await userEvent.type(input, "Buy milk");
    await userEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("keeps input value when add fails", async () => {
    (todoStore.getStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      status: asyncStatus("error"),
      error: "Failed",
    });
    render(<TodoInputInner addState={idle} />);
    const input = screen.getByPlaceholderText("What needs to be done?") as HTMLInputElement;
    await userEvent.type(input, "Buy milk");
    await userEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(input.value).toBe("Buy milk");
    });
  });
});
