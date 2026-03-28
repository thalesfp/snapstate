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
  if (status.isIdle || status.isLoading) {
    return <p>Loading...</p>;
  }

  if (status.isError) {
    return <p>Error: {error}</p>;
  }

  if (!todo) {
    return <p>Todo not found</p>;
  }

  return (
    <div className="todo-detail">
      <h2>{todo.text}</h2>
      <p>Status: {todo.completed ? "Completed" : "Active"}</p>
      <Link to="/todos">&larr; Back to list</Link>
    </div>
  );
};

export const TodoDetail = todoDetailStore.connect(TodoDetailView, {
  select: (pick) => ({ todo: pick("todo") }),
  fetch: (s, props) => s.fetchTodo(String(props.id)),
  cleanup: (s) => s.reset(),
  deps: (props) => [props.id],
});
