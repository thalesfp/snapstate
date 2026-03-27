import { todoStore } from "../../stores";
import type { Filter } from "../../stores";

const FILTERS: Filter[] = ["all", "active", "completed"];

export function FilterBarInner({ filter }: { filter: Filter }) {
  return (
    <div className="filter-bar">
      <div className="filter-buttons">
        {FILTERS.map((f) => (
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
  select: (pick) => ({ filter: pick("filter") }),
});
