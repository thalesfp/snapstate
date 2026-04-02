import { Component } from "react";
import { Link } from "react-router";
import { connect } from "snapstate/react";
import type { OperationState } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Todo } from "../../stores";

interface TodoItemProps {
  todo: Todo;
  editState: OperationState;
}

interface TodoItemState {
  editing: boolean;
  draft: string;
}

@connect(todoStore, (store: typeof todoStore) => ({
  editState: store.getStatus("edit"),
}))
class TodoItem extends Component<TodoItemProps, TodoItemState> {
  private skipBlur = false;

  state: TodoItemState = {
    editing: false,
    draft: this.props.todo.text,
  };

  handleSave = async () => {
    await todoStore.editTodo(this.props.todo.id, this.state.draft);
    this.setState({ editing: false });
  };

  handleBlur = () => {
    if (this.skipBlur) {
      this.skipBlur = false;
      return;
    }
    this.handleSave();
  };

  handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      this.skipBlur = true;
      this.handleSave();
    }
    if (e.key === "Escape") {
      this.skipBlur = true;
      this.setState({ draft: this.props.todo.text, editing: false });
    }
  };

  render() {
    const { todo, editState } = this.props;
    const { editing, draft } = this.state;
    const saving = editState.status.isLoading;

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
            onChange={(e) => this.setState({ draft: e.target.value })}
            onBlur={this.handleBlur}
            onKeyDown={this.handleKeyDown}
            disabled={saving}
            autoFocus
          />
        ) : (
          <>
            <span className="todo-text" onDoubleClick={() => this.setState({ editing: true })}>
              {todo.text}
            </span>
            <Link className="detail-link" to={`/todos/${todo.id}`}>
              ›
            </Link>
          </>
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
}

export { TodoItem };
