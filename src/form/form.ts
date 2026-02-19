import { z } from "zod";
import { ReactSnapStore } from "../react/store.js";
import type { OperationState } from "../core/types.js";

export type ValidationMode = "onSubmit" | "onBlur" | "onChange";

export interface FormConfig {
  validationMode: ValidationMode;
}

export type FormErrors<V> = { [K in keyof V]?: string[] };

export interface FormState<V extends Record<string, unknown>> {
  values: V;
  initial: V;
  errors: FormErrors<V>;
  submitStatus: OperationState;
}

export function getObjectSchema(
  schema: z.ZodTypeAny,
): z.ZodObject<any> | null {
  if (schema instanceof z.ZodObject) return schema;
  if (schema instanceof z.ZodPipe)
    return getObjectSchema((schema as any)._zod.def.in);
  return null;
}

export class SnapFormStore<
  V extends Record<string, unknown>,
  K extends string = string,
> extends ReactSnapStore<FormState<V>, K> {
  private schema: z.ZodTypeAny;
  private objectSchema: z.ZodObject<any> | null;
  private formConfig: FormConfig;

  constructor(
    schema: z.ZodTypeAny,
    initialValues: V,
    config?: Partial<FormConfig>,
  ) {
    super({
      values: { ...initialValues },
      initial: { ...initialValues },
      errors: {} as FormErrors<V>,
      submitStatus: { status: "idle", error: null },
    });
    this.schema = schema;
    this.objectSchema = getObjectSchema(schema);
    this.formConfig = {
      validationMode: config?.validationMode ?? "onSubmit",
    };
  }

  get values(): V {
    return this.state.get("values");
  }

  get errors(): FormErrors<V> {
    return this.state.get("errors");
  }

  get isDirty(): boolean {
    const values = this.state.get("values");
    const initial = this.state.get("initial");
    for (const key of Object.keys(initial)) {
      if (values[key] !== initial[key]) return true;
    }
    return false;
  }

  get isValid(): boolean {
    const errors = this.state.get("errors");
    return Object.keys(errors).length === 0;
  }

  setValue<F extends keyof V & string>(field: F, value: V[F]): void {
    this.state.set(`values.${field}` as any, value);
    this.handleChange(field);
  }

  handleBlur(field: keyof V & string): void {
    if (this.formConfig.validationMode === "onBlur") {
      this.validateField(field);
    }
  }

  handleChange(field: keyof V & string): void {
    if (this.formConfig.validationMode === "onChange") {
      this.validateField(field);
    }
  }

  isFieldDirty(field: keyof V & string): boolean {
    return (
      this.state.get(`values.${field}` as any) !==
      this.state.get(`initial.${field}` as any)
    );
  }

  setError(field: keyof V & string, message: string): void {
    const errors = this.state.get("errors");
    const existing = errors[field] ?? [];
    this.state.set(`errors.${field}` as any, [...existing, message] as any);
  }

  clearErrors(): void {
    this.state.set("errors", {} as FormErrors<V>);
  }

  validate(): V | null {
    const result = this.schema.safeParse(this.state.get("values"));
    if (result.success) {
      this.clearErrors();
      return result.data as V;
    }
    const errors: Record<string, string[]> = {};
    for (const issue of (result as any).error.issues) {
      const field = issue.path[0] as string;
      if (!errors[field]) errors[field] = [];
      errors[field].push(issue.message);
    }
    this.state.set("errors", errors as FormErrors<V>);
    return null;
  }

  validateField(field: keyof V & string): void {
    if (!this.objectSchema) return;
    const fieldSchema = this.objectSchema.shape[field];
    if (!fieldSchema) return;
    const value = this.state.get(`values.${field}` as any);
    const result = (fieldSchema as z.ZodTypeAny).safeParse(value);
    if (result.success) {
      const errors = { ...this.state.get("errors") };
      delete errors[field];
      this.state.set("errors", errors as FormErrors<V>);
    } else {
      const messages = (result as any).error.issues.map(
        (i: { message: string }) => i.message,
      );
      this.state.set(`errors.${field}` as any, messages as any);
    }
  }

  reset(): void {
    const initial = this.state.get("initial");
    this.state.batch(() => {
      this.state.set("values", { ...initial });
      this.state.set("errors", {} as FormErrors<V>);
      this.state.set("submitStatus", { status: "idle", error: null });
    });
  }

  clear(): void {
    const initial = this.state.get("initial");
    const empty = Object.keys(initial).reduce(
      (acc, key) => {
        const val = initial[key];
        if (typeof val === "number") { (acc as any)[key] = 0; }
        else if (typeof val === "boolean") { (acc as any)[key] = false; }
        else if (val === null) { (acc as any)[key] = null; }
        else if (Array.isArray(val)) { (acc as any)[key] = []; }
        else { (acc as any)[key] = ""; }
        return acc;
      },
      {} as V,
    );
    this.state.batch(() => {
      this.state.set("values", empty);
      this.state.set("errors", {} as FormErrors<V>);
    });
  }

  setInitialValues(values: Partial<V>): void {
    const current = this.state.get("initial");
    const merged = { ...current, ...values } as V;
    this.state.batch(() => {
      this.state.set("values", { ...merged });
      this.state.set("initial", merged);
    });
  }

  submit(
    key: K,
    handler: (values: V) => Promise<void>,
  ): Promise<void> | undefined {
    const data = this.validate();
    if (!data) return undefined;
    const promise = this.api.fetch(key, () => handler(data));
    this.syncSubmitStatus(key);
    return promise;
  }

  protected syncSubmitStatus(key: K): void {
    const update = () => {
      const status = this.getStatus(key);
      const current = this.state.get("submitStatus");
      if (
        current.status === status.status &&
        current.error === status.error
      )
        return;
      this.state.set("submitStatus", status);
    };
    update();
    const unsub = this.subscribe(() => {
      update();
      const s = this.getStatus(key).status;
      if (s === "ready" || s === "error") unsub();
    });
  }
}
