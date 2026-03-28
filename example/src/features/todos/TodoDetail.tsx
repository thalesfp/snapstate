import { Link } from "react-router";
import { todoDetailStore } from "../../stores";
import type { Todo } from "../../shared/types";
import type { AsyncStatus } from "snapstate";

interface TodoDetailViewProps {
  id: string;
  todo: Todo | null;
  status: AsyncStatus;
  error: string | null;
}

const TodoDetailView = ({ todo, status, error }: TodoDetailViewProps) => {
  const loading = status.isIdle || status.isLoading;

  const content = (() => {
    if (loading) {
      return <div className="loading-spinner" />;
    }
    if (status.isError) {
      return <p className="todo-detail-error">Error: {error}</p>;
    }
    if (!todo) {
      return <p className="empty-message">Todo not found</p>;
    }
    return (
      <>
        <h2 className="todo-detail-title">{todo.text}</h2>
        <span className={`todo-detail-status ${todo.completed ? "completed" : "active"}`}>
          {todo.completed ? "Completed" : "Active"}
        </span>
      </>
    );
  })();

  return (
    <div className="todo-detail">
      {content}
      {!loading && <Link className="todo-detail-back" to="/todos">&larr; Back to list</Link>}
    </div>
  );
};

export const TodoDetail = todoDetailStore.connect(TodoDetailView, {
  select: (pick) => ({ todo: pick("todo") }),
  fetch: (s, props) => s.fetchTodo(props.id),
  cleanup: (s) => s.reset(),
  deps: (props) => [props.id],
});
