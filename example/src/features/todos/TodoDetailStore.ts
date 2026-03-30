import { SnapStore } from "snapstate/react";
import type { Todo } from "../../shared/types";

interface TodoDetailState {
  todo: Todo | null;
}

export class TodoDetailStore extends SnapStore<TodoDetailState, "fetch"> {
  constructor() {
    super({ todo: null });
  }

  fetchTodo(id: string) {
    return this.api.get<Todo>("fetch", `/api/todos/${id}`, (todo) => {
      this.state.set("todo", todo);
    });
  }
}
