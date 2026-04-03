import { SnapStore } from "snapstate/react";
import type { StoreOptions } from "snapstate";
import type { Todo, Activity } from "../../shared/types";

interface TodoDetailState {
  todo: Todo | null;
  activity: Activity[];
}

export class TodoDetailStore extends SnapStore<TodoDetailState, "fetch"> {
  constructor(options?: StoreOptions) {
    super({ todo: null, activity: [] }, options);
  }

  fetchTodo(id: string) {
    return this.api.fetch({ key: "fetch", fn: async () => {
      const [todo, activity] = await Promise.all([
        this.http.request<Todo>(`/api/todos/${id}`),
        this.http.request<Activity[]>(`/api/todos/${id}/activity`),
      ]);

      this.state.merge({ todo, activity });
    }});
  }
}
