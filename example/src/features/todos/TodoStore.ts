import { SnapStore } from "snapstate/react";
import type { Subscribable } from "snapstate";
import type { Todo, Filter, User } from "../../shared/types";

type TodoOp = "fetch" | "add" | "toggle" | "remove" | "edit" | "clearCompleted";

export interface TodoState {
  todos: Todo[];
  filter: Filter;
  userId: string;
}

export class TodoStore extends SnapStore<TodoState, TodoOp> {
  private nextId = 1;

  constructor(auth: Subscribable<{ user: User | null }>) {
    super({ todos: [], filter: "all", userId: "" });
    this.derive("userId", auth, (s) => s.user?.id ?? "");
  }

  fetchTodos() {
    return this.api.get<Todo[]>("fetch", "/api/todos", (todos) => {
      this.setTodos(todos);
    });
  }

  /** The current visibility filter. */
  get filter(): Filter {
    return this.state.get().filter;
  }

  /** Todos matching the current {@link filter}. */
  get filteredTodos(): Todo[] {
    switch (this.state.get().filter) {
      case "active":
        return this.state.filter("todos", (t) => !t.completed);
      case "completed":
        return this.state.filter("todos", (t) => t.completed);
      default:
        return this.state.get("todos");
    }
  }

  /** Number of incomplete todos. */
  get remaining(): number {
    return this.state.count("todos", (t) => !t.completed);
  }

  /** Number of completed todos. */
  get completedCount(): number {
    return this.state.count("todos", (t) => t.completed);
  }

  /** Create a todo via the API. No-ops if text is blank. */
  addTodo(text: string) {
    const trimmed = text.trim();

    if (!trimmed) return;

    return this.api.post<Todo>("add", "/api/todos", {
      body: { text: trimmed },
      onSuccess: (todo) => {
        this.state.append("todos", todo);
        this.nextId = Math.max(this.nextId, Number(todo.id) + 1);
      },
    });
  }

  /** Toggle a todo's completed state. Optimistic with rollback. */
  toggleTodo(id: string) {
    const todo = this.state.find("todos", (t) => t.id === id);
    if (!todo) {
      return;
    }

    const newCompleted = !todo.completed;

    this.state.patch("todos", (t) => t.id === id, { completed: newCompleted });

    return this.api.patch("toggle", `/api/todos/${id}`, {
      body: { completed: newCompleted },
      onError: () => {
        this.state.patch("todos", (t) => t.id === id, { completed: !newCompleted });
      },
    });
  }

  /** Delete a todo. Optimistic with rollback to original position. */
  removeTodo(id: string) {
    const idx = this.state.findIndexOf("todos", (t) => t.id === id);
    if (idx === -1) return;

    const removed = this.state.at("todos", idx);
    if (!removed) return;
    this.state.removeAt("todos", idx);

    return this.api.delete("remove", `/api/todos/${id}`, {
      onError: () => {
        this.state.insertAt("todos", idx, removed);
      },
    });
  }

  /** Rename a todo. Optimistic with rollback. No-ops if text is blank. */
  editTodo(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const oldText = this.state.find("todos", (t) => t.id === id)?.text;

    this.state.patch("todos", (t) => t.id === id, { text: trimmed });

    return this.api.patch("edit", `/api/todos/${id}`, {
      body: { text: trimmed },
      onError: () => {
        this.state.patch("todos", (t) => t.id === id, { text: oldText ?? trimmed });
      },
    });
  }

  /** Set the visibility filter applied by {@link filteredTodos}. */
  setFilter(filter: Filter) {
    this.state.set("filter", filter);
  }

  /** Replace the full todo list, e.g. after an initial fetch. */
  setTodos(todos: Todo[]) {
    this.state.set("todos", todos);
    this.nextId = Math.max(0, ...todos.map((t) => Number(t.id))) + 1;
  }

  /** Remove all completed todos. Optimistic with rollback. */
  clearCompleted() {
    const removed = this.state.filter("todos", (t) => t.completed);
    this.state.remove("todos", (t) => t.completed);

    return this.api.post("clearCompleted", "/api/todos/clear-completed", {
      onError: () => {
        this.state.append("todos", ...removed);
      },
    });
  }
}
