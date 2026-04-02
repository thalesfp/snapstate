import { Link } from "react-router";
import { TodoDetailLayout } from "./TodoDetailLayout";

export function TodoDetailError({ error }: { error: string }) {
  return (
    <TodoDetailLayout>
      <p className="todo-detail-error">{error}</p>
      <Link className="todo-detail-back" to="/todos">&larr; Back to list</Link>
    </TodoDetailLayout>
  );
}
