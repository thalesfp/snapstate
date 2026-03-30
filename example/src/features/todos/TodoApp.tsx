import { todoStore } from "../../stores";
import { TodoInput } from "./TodoInput";
import { TodoList } from "./TodoList";
import { FilterBar } from "./FilterBar";
import { TodoCount } from "./TodoCount";

function TodoAppInner() {
  return (
    <>
      <TodoInput />
      <TodoList />
      <div className="footer">
        <TodoCount />
        <FilterBar />
      </div>
    </>
  );
}

function TodoAppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <h1>Todos</h1>
      {children}
    </div>
  );
}

export const TodoApp = todoStore.connect(TodoAppInner, {
  select: () => ({}),
  fetch: (store) => store.fetchTodos(),
  cleanup: (store) => store.setFilter("all"),
  template: TodoAppTemplate,
  loading: () => <div className="app"><div className="loading-spinner" /></div>,
  error: ({ error }) => <p>Error: {error}</p>,
});
