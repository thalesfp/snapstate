import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo } from "../../stores";
import type { TodoState } from "./TodoStore";

function TodoCountInner({ todos }: { todos: Todo[] }) {
  const remaining = todos.filter((t) => !t.completed).length;
  return (
    <span className="todo-count">
      {remaining} {remaining === 1 ? "item" : "items"} left
    </span>
  );
}

export const TodoCount = todoStore.connect(TodoCountInner, {
  select: (pick: PickFn<TodoState>) => ({ todos: pick("todos") }),
});
