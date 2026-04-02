import { Component } from "react";
import { connect } from "snapstate/react";
import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo, Filter } from "../../stores";
import type { TodoState } from "./TodoStore";
import { TodoItem } from "./TodoItem";

@connect(todoStore, {
  select: (pick: PickFn<TodoState>) => ({ todos: pick("todos"), filter: pick("filter") }),
})
class TodoList extends Component<{ todos: Todo[]; filter: Filter }> {
  render() {
    const { todos, filter } = this.props;
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
          // @ts-expect-error editState injected by @connect decorator
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </ul>
    );
  }
}

export { TodoList };
