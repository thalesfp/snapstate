import { Component } from "react";
import { Link } from "react-router";
import { scoped } from "snapstate/react";
import { TodoDetailStore } from "./TodoDetailStore";
import { TodoDetailLayout } from "./TodoDetailLayout";
import { TodoDetailError } from "./TodoDetailError";
import type { Todo } from "../../shared/types";

@scoped({
  factory: () => new TodoDetailStore(),
  props: (store: TodoDetailStore) => ({ todo: store.getSnapshot().todo }),
  template: TodoDetailLayout,
  loading: () => <div className="loading-spinner" />,
  error: TodoDetailError,
  fetch: (store: TodoDetailStore, props: { id: string }) =>
    store.fetchTodo(props.id),
  deps: (props: { id: string }) => [props.id],
})
class TodoDetail extends Component<{ id: string; todo: Todo | null }> {
  render() {
    const { todo } = this.props;

    return (
      <>
        {!todo ? (
          <p className="empty-message">Todo not found</p>
        ) : (
          <>
            <h2 className="todo-detail-title">{todo.text}</h2>
            <span
              className={`todo-detail-status ${todo.completed ? "completed" : "active"}`}
            >
              {todo.completed ? "Completed" : "Active"}
            </span>
          </>
        )}
        <Link className="todo-detail-back" to="/todos">
          &larr; Back to list
        </Link>
      </>
    );
  }
}

export { TodoDetail };
