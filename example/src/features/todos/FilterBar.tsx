import { Component } from "react";
import { connect } from "snapstate/react";
import type { PickFn } from "snapstate/react";
import { todoStore } from "../../stores";
import type { Filter } from "../../stores";
import type { TodoState } from "./TodoStore";

const FILTERS: Filter[] = ["all", "active", "completed"];

@connect(todoStore, {
  select: (pick: PickFn<TodoState>) => ({ filter: pick("filter") }),
})
class FilterBar extends Component<{ filter: Filter }> {
  render() {
    const { filter } = this.props;
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
}

export { FilterBar };
