import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo, Filter } from "../../stores";
import type { TodoState } from "./TodoStore";
import { TodoItem } from "./TodoItem";

function TodoListInner({ todos, filter }: { todos: Todo[]; filter: Filter }) {
  const visible =
    filter === "all"
      ? todos
      : filter === "active"
        ? todos.filter((t) => !t.completed)
        : todos.filter((t) => t.completed);

  if (visible.length === 0) {
    return <p className="empty-message">No todos to show</p>;
  }

  return (
    <ul className="todo-list">
      {visible.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}

export const TodoList = todoStore.connect(TodoListInner, {
  select: (pick: PickFn<TodoState>) => ({ todos: pick("todos"), filter: pick("filter") }),
});
