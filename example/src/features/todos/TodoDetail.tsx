import { Link } from "react-router";
import { SnapStore } from "snapstate/react";
import { TodoDetailStore } from "./TodoDetailStore";
import type { Todo } from "../../shared/types";

interface TodoDetailViewProps {
  id: string;
  todo: Todo | null;
}

const TodoDetailView = ({ todo }: TodoDetailViewProps) => {
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
};

const TodoDetailLayout = ({ children }: { children: React.ReactNode }) => {
  return <div className="todo-detail">{children}</div>;
};

export const TodoDetail = SnapStore.scoped(TodoDetailView, {
  factory: () => new TodoDetailStore(),
  props: (store) => ({ todo: store.getSnapshot().todo }),
  template: TodoDetailLayout,
  loading: () => <div className="loading-spinner" />,
  error: ({ error }) => (
    <TodoDetailLayout>
      <p className="todo-detail-error">{error}</p>
      <Link className="todo-detail-back" to="/todos">&larr; Back to list</Link>
    </TodoDetailLayout>
  ),
  fetch: (store, props) => store.fetchTodo(props.id),
  deps: (props) => [props.id],
});
