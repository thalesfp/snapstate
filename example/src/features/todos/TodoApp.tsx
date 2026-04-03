import { todoStore, urlParams } from "../../stores";
import { FILTER_VALUES } from "../../shared/types";
import { TodoInput } from "./TodoInput";
import { TodoList } from "./TodoList";
import { FilterBar } from "./FilterBar";
import { TodoCount } from "./TodoCount";

const VALID_FILTERS: Set<string> = new Set(FILTER_VALUES);

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
  urlParams,
  fetch: (store, _props, params) => {
    if (typeof params.filter === "string" && VALID_FILTERS.has(params.filter)) {
      store.setFilter(params.filter as "all" | "active" | "completed");
    }
    return store.fetchTodos();
  },
  template: TodoAppTemplate,
  loading: () => <div className="app"><div className="loading-spinner" /></div>,
  error: ({ error }) => <p>Error: {error}</p>,
});
