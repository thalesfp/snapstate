import { describe, it, expect, beforeEach } from "vitest";
import { setHttpClient, type HttpClient } from "snapstate/react";
import { TodoStore } from "./TodoStore";

let nextMockId = 1;

setHttpClient({
  request: (async (url: string, init?: { method?: string; body?: unknown }) => {
    if (init?.method === "POST" && url === "/api/todos") {
      const body = init.body as { text: string };
      return { id: String(nextMockId++), text: body.text, completed: false };
    }
  }) as HttpClient["request"],
});

describe("TodoStore", () => {
  let store: TodoStore;

  beforeEach(() => {
    store = new TodoStore();
    nextMockId = 1;
  });

  describe("addTodo", () => {
    it("adds a todo with trimmed text", async () => {
      await store.addTodo("  Buy milk  ");
      expect(store.filteredTodos).toEqual([
        { id: "1", text: "Buy milk", completed: false },
      ]);
    });

    it("ignores empty or whitespace-only text", async () => {
      await store.addTodo("");
      await store.addTodo("   ");
      expect(store.filteredTodos).toEqual([]);
    });

    it("assigns incrementing ids", async () => {
      await store.addTodo("First");
      await store.addTodo("Second");
      const ids = store.filteredTodos.map((t) => t.id);
      expect(ids).toEqual(["1", "2"]);
    });
  });

  describe("toggleTodo", () => {
    it("toggles completed state", async () => {
      await store.addTodo("Task");
      await store.toggleTodo("1");
      expect(store.filteredTodos[0].completed).toBe(true);

      await store.toggleTodo("1");
      expect(store.filteredTodos[0].completed).toBe(false);
    });

    it("only toggles the targeted todo", async () => {
      await store.addTodo("A");
      await store.addTodo("B");
      await store.toggleTodo("1");

      expect(store.filteredTodos[0].completed).toBe(true);
      expect(store.filteredTodos[1].completed).toBe(false);
    });
  });

  describe("removeTodo", () => {
    it("removes a todo by id", async () => {
      await store.addTodo("A");
      await store.addTodo("B");
      await store.removeTodo("1");
      expect(store.filteredTodos).toEqual([
        { id: "2", text: "B", completed: false },
      ]);
    });
  });

  describe("editTodo", () => {
    it("updates the text of a todo", async () => {
      await store.addTodo("Old text");
      await store.editTodo("1", "New text");
      expect(store.filteredTodos[0].text).toBe("New text");
    });

    it("trims the new text", async () => {
      await store.addTodo("Task");
      await store.editTodo("1", "  Updated  ");
      expect(store.filteredTodos[0].text).toBe("Updated");
    });

    it("ignores empty or whitespace-only text", async () => {
      await store.addTodo("Task");
      await store.editTodo("1", "");
      await store.editTodo("1", "   ");
      expect(store.filteredTodos[0].text).toBe("Task");
    });
  });

  describe("filter", () => {
    beforeEach(async () => {
      await store.addTodo("Active task");
      await store.addTodo("Completed task");
      await store.toggleTodo("2");
    });

    it("defaults to 'all'", () => {
      expect(store.filter).toBe("all");
      expect(store.filteredTodos).toHaveLength(2);
    });

    it("filters active todos", () => {
      store.setFilter("active");
      expect(store.filteredTodos).toEqual([
        { id: "1", text: "Active task", completed: false },
      ]);
    });

    it("filters completed todos", () => {
      store.setFilter("completed");
      expect(store.filteredTodos).toEqual([
        { id: "2", text: "Completed task", completed: true },
      ]);
    });

    it("shows all todos with 'all' filter", () => {
      store.setFilter("active");
      store.setFilter("all");
      expect(store.filteredTodos).toHaveLength(2);
    });
  });

  describe("remaining", () => {
    it("counts non-completed todos", async () => {
      await store.addTodo("A");
      await store.addTodo("B");
      await store.addTodo("C");
      expect(store.remaining).toBe(3);

      await store.toggleTodo("1");
      expect(store.remaining).toBe(2);
    });
  });

  describe("completedCount", () => {
    it("counts completed todos", async () => {
      await store.addTodo("A");
      await store.addTodo("B");
      expect(store.completedCount).toBe(0);

      await store.toggleTodo("1");
      await store.toggleTodo("2");
      expect(store.completedCount).toBe(2);
    });
  });

  describe("clearCompleted", () => {
    it("removes all completed todos", async () => {
      await store.addTodo("Keep");
      await store.addTodo("Remove");
      await store.addTodo("Also remove");
      await store.toggleTodo("2");
      await store.toggleTodo("3");

      await store.clearCompleted();

      expect(store.filteredTodos).toEqual([
        { id: "1", text: "Keep", completed: false },
      ]);
    });

    it("does nothing when no todos are completed", async () => {
      await store.addTodo("A");
      await store.addTodo("B");
      await store.clearCompleted();
      expect(store.filteredTodos).toHaveLength(2);
    });
  });
});
