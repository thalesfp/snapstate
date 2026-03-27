import type { OperationState } from "snapstate/react";
import { todoStore, todoInputStore } from "../../stores";

interface TodoInputProps {
  addState: OperationState;
}

export function TodoInputInner({ addState }: TodoInputProps) {
  const adding = addState.status.isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = todoInputStore.getValue("text");
    await todoStore.addTodo(text);
    if (!todoStore.getStatus("add").status.isError) {
      todoInputStore.clear();
    }
  };

  return (
    <form className="todo-input" onSubmit={handleSubmit}>
      <input
        type="text"
        {...todoInputStore.register("text")}
        placeholder="What needs to be done?"
        disabled={adding}
        autoFocus
      />
      <button type="submit" disabled={adding}>
        {adding ? "Adding..." : "Add"}
      </button>
      {addState.error && <p className="error">{addState.error}</p>}
    </form>
  );
}

export const TodoInput = todoStore.connect(TodoInputInner, {
  props: (store) => ({ addState: store.getStatus("add") }),
  cleanup: () => todoInputStore.clear(),
});
