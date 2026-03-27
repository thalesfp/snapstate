import { SnapFormStore } from "snapstate/form";
import { z } from "zod";

const todoInputSchema = z.object({
  text: z.string().min(1),
});

type TodoInputValues = z.infer<typeof todoInputSchema>;

export class TodoInputStore extends SnapFormStore<TodoInputValues> {
  constructor() {
    super(todoInputSchema, { text: "" });
  }
}
