import { Component } from "react";
import { connect } from "snapstate/react";
import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo } from "../../stores";
import type { TodoState } from "./TodoStore";

@connect(todoStore, {
  select: (pick: PickFn<TodoState>) => ({ todos: pick("todos") }),
})
class TodoCount extends Component<{ todos: Todo[] }> {
  render() {
    const remaining = this.props.todos.filter((t) => !t.completed).length;
    return (
      <span className="todo-count">
        {remaining} {remaining === 1 ? "item" : "items"} left
      </span>
    );
  }
}

export { TodoCount };
