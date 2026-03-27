import { todoStore } from "../../stores";
import type { Todo } from "../../stores";

export function TodoCountInner({ todos }: { todos: Todo[] }) {
  const remaining = todos.filter((t) => !t.completed).length;
  return (
    <span className="todo-count">
      {remaining} {remaining === 1 ? "item" : "items"} left
    </span>
  );
}

export const TodoCount = todoStore.connect(TodoCountInner, {
  select: (pick) => ({ todos: pick("todos") }),
});
