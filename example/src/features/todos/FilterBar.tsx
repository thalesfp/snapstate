import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Filter } from "../../stores";
import { FILTER_VALUES } from "../../shared/types";
import type { TodoState } from "./TodoStore";

function FilterBarInner({ filter }: { filter: Filter }) {
  return (
    <div className="filter-bar">
      <div className="filter-buttons">
        {FILTER_VALUES.map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => todoStore.setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <button className="clear-btn" onClick={() => todoStore.clearCompleted()}>
        Clear completed
      </button>
    </div>
  );
}

export const FilterBar = todoStore.connect(FilterBarInner, {
  select: (pick: PickFn<TodoState>) => ({ filter: pick("filter") }),
});
