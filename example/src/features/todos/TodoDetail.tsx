import { Link } from "react-router";
import { SnapStore } from "snapstate/react";
import { TodoDetailStore } from "./TodoDetailStore";
import { TodoDetailLayout } from "./TodoDetailLayout";
import { TodoDetailError } from "./TodoDetailError";
import type { Todo, Activity } from "../../shared/types";

function TodoDetailInner({
  todo,
  activity,
}: {
  id: string;
  todo: Todo | null;
  activity: Activity[];
}) {
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
            {todo.completed ? `Completed ${new Date(todo.completedAt).toLocaleDateString()}` : "Active"}
          </span>
          {activity.length > 0 && (
            <ul className="todo-detail-activity">
              {activity.map((a) => (
                <li key={a.id}>
                  {a.action} - {new Date(a.timestamp).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link className="todo-detail-back" to="/todos">
        &larr; Back to list
      </Link>
    </>
  );
}

export const TodoDetail = SnapStore.scoped(TodoDetailInner, {
  factory: () => new TodoDetailStore(),
  props: (store: TodoDetailStore) => {
    const snapshot = store.getSnapshot();
    return { todo: snapshot.todo, activity: snapshot.activity };
  },
  template: TodoDetailLayout,
  loading: () => <div className="loading-spinner" />,
  error: TodoDetailError,
  fetch: (store: TodoDetailStore, props: { id: string }) =>
    store.fetchTodo(props.id),
  deps: (props: { id: string }) => [props.id],
});
