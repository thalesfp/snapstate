import { useParams } from "react-router";
import { TodoDetail } from "./TodoDetail";

export const TodoDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <p>Todo not found</p>;
  }

  return <TodoDetail id={id} />;
};
