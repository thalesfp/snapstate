import { todoStore } from "../../stores";
import { TodoInput } from "./TodoInput";
import { TodoList } from "./TodoList";
import { FilterBar } from "./FilterBar";
import { TodoCount } from "./TodoCount";

function TodoAppInner() {
  return (
    <div className="app">
      <h1>Todos</h1>
      <TodoInput />
      <TodoList />
      <div className="footer">
        <TodoCount />
        <FilterBar />
      </div>
    </div>
  );
}

export const TodoApp = todoStore.connect(TodoAppInner, {
  select: () => ({}),
  fetch: (store) => store.fetchTodos(),
  cleanup: (store) => store.setFilter("all"),
  loading: () => <div className="app"><div className="loading-spinner" /></div>,
  error: ({ error }) => <p>Error: {error}</p>,
});
