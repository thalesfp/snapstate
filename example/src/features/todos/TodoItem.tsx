import { useRef, useState } from "react";
import { Link } from "react-router";
import type { OperationState } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo } from "../../stores";

interface TodoItemProps {
  todo: Todo;
  editState: OperationState;
}

export function TodoItemInner({ todo, editState }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const skipBlurRef = useRef(false);

  const saving = editState.status.isLoading;

  const handleSave = async () => {
    await todoStore.editTodo(todo.id, draft);
    setEditing(false);
  };

  const handleBlur = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    handleSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      skipBlurRef.current = true;
      handleSave();
    }
    if (e.key === "Escape") {
      skipBlurRef.current = true;
      setDraft(todo.text);
      setEditing(false);
    }
  };

  return (
    <li className={`todo-item ${todo.completed ? "completed" : ""} ${saving ? "saving" : ""}`}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => todoStore.toggleTodo(todo.id)}
        disabled={saving}
      />
      {editing ? (
        <input
          className="edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={saving}
          autoFocus
        />
      ) : (
        <span className="todo-text" onDoubleClick={() => setEditing(true)}>
          {todo.text}
        </span>
        <Link className="detail-link" to={`/todos/${todo.id}`}>
          ›
        </Link>
      )}
      {saving ? (
        <span className="save-spinner" />
      ) : (
        <button className="delete-btn" onClick={() => todoStore.removeTodo(todo.id)}>
          ×
        </button>
      )}
    </li>
  );
}

export const TodoItem = todoStore.connect(TodoItemInner, (store) => ({
  editState: store.getStatus("edit"),
}));
