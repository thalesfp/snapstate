import { z } from "zod";
import { ReactSnapStore } from "../react/store.js";
import { asyncStatus } from "../core/types.js";
import type { OperationState } from "../core/types.js";

/** When to run field validation: on form submit, on field blur, or on every change. */
export type ValidationMode = "onSubmit" | "onBlur" | "onChange";

/** Configuration for a `SnapFormStore`. */
export interface FormConfig {
  /** When to trigger field-level validation. */
  validationMode: ValidationMode;
}

/** Union of native form elements supported by `register()`. */
export type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Per-field error messages keyed by field name. */
export type FormErrors<V> = { [K in keyof V]?: string[] };

/** Internal state shape managed by `SnapFormStore`. */
export interface FormState<V extends Record<string, unknown>> {
  values: V;
  initial: V;
  errors: FormErrors<V>;
  submitStatus: OperationState;
}

/** Unwrap a Zod schema to its inner `ZodObject`, or return `null` if not an object schema. */
export function getObjectSchema(
  schema: z.ZodTypeAny,
): z.ZodObject<any> | null {
  if (schema instanceof z.ZodObject) return schema;
  if (schema instanceof z.ZodPipe)
    return getObjectSchema((schema as any)._zod.def.in);
  return null;
}

const INNER_TYPE_WRAPPERS = new Set([
  "optional", "nullable", "default", "prefault",
  "catch", "nonoptional", "success", "readonly",
]);

/** Recursively unwrap a Zod schema to its base type name (e.g. `"string"`, `"number"`, `"boolean"`). */
export function getBaseSchemaType(schema: unknown): string | null {
  if (
    !schema ||
    typeof schema !== "object" ||
    !("_zod" in schema) ||
    !(schema as any)._zod?.def?.type
  ) {
    return null;
  }
  const type: string = (schema as any)._zod.def.type;
  if (INNER_TYPE_WRAPPERS.has(type)) {
    return getBaseSchemaType((schema as any)._zod.def.innerType);
  }
  if (type === "pipe") {
    return getBaseSchemaType((schema as any)._zod.def.in);
  }
  if (type === "literal") {
    const vals = (schema as any)._zod.def.values;
    if (Array.isArray(vals) && vals.length > 0) {
      if (vals[0] === null) { return "null"; }
      return typeof vals[0];
    }
    return "string";
  }
  return type;
}

/**
 * Reactive form store backed by a Zod schema. Handles validation, DOM binding, and submit lifecycle.
 * @example
 * const form = new SnapFormStore(schema, { name: "", age: 0 })
 * // In JSX: <input {...form.register("name")} />
 */
export class SnapFormStore<
  V extends Record<string, unknown>,
  K extends string = string,
> extends ReactSnapStore<FormState<V>, K> {
  private schema: z.ZodTypeAny;
  private objectSchema: z.ZodObject<any> | null;
  private formConfig: FormConfig;
  private _refs: Map<string, FormElement> = new Map();
  private _radioRefs: Map<string, Set<FormElement>> = new Map();

  constructor(
    schema: z.ZodTypeAny,
    initialValues: V,
    config?: Partial<FormConfig>,
  ) {
    super({
      values: { ...initialValues },
      initial: { ...initialValues },
      errors: {} as FormErrors<V>,
      submitStatus: { status: asyncStatus("idle"), error: null },
    });
    this.schema = schema;
    this.objectSchema = getObjectSchema(schema);
    this.formConfig = {
      validationMode: config?.validationMode ?? "onSubmit",
    };
  }

  /** Current form values. */
  get values(): V {
    return this.state.get("values");
  }

  /** Current per-field validation errors. */
  get errors(): FormErrors<V> {
    return this.state.get("errors");
  }

  /** `true` if any field value differs from its initial value. */
  get isDirty(): boolean {
    const values = this.state.get("values");
    const initial = this.state.get("initial");
    const shapeKeys = this.objectSchema ? Object.keys(this.objectSchema.shape) : [];
    const allKeys = new Set([...Object.keys(initial), ...shapeKeys]);
    for (const key of allKeys) {
      if (!this.valuesEqual(values[key], initial[key])) { return true; }
    }
    return false;
  }

  /** `true` if there are no validation errors. */
  get isValid(): boolean {
    const errors = this.state.get("errors");
    return Object.keys(errors).length === 0;
  }

  /**
   * Bind a form field to a native input element. Returns props to spread onto the element.
   * @example <input {...form.register("email")} />
   */
  register(field: keyof V & string): {
    ref: (el: FormElement | null) => void;
    name: string;
    defaultValue?: string;
    defaultChecked?: boolean;
    onBlur: () => void;
    onChange: () => void;
  } {
    const value = this.state.get(`values.${field}` as any);
    const isBool = this.getFieldType(field) === "boolean";
    const trackedEls = new Set<FormElement>();
    return {
      ref: (el: FormElement | null) => {
        if (el) {
          if ((el as HTMLInputElement).type === "radio") {
            if (!this._radioRefs.has(field)) this._refs.delete(field);
            let set = this._radioRefs.get(field);
            if (!set) { set = new Set(); this._radioRefs.set(field, set); }
            set.add(el);
          } else {
            this._refs.set(field, el);
            if (value instanceof Date || Array.isArray(value)) {
              this.syncValueToDom(field, value);
            }
          }
          trackedEls.add(el);
        } else {
          for (const tracked of trackedEls) {
            const set = this._radioRefs.get(field);
            if (set) {
              set.delete(tracked);
              if (set.size === 0) this._radioRefs.delete(field);
            } else {
              this._refs.delete(field);
            }
          }
          trackedEls.clear();
        }
      },
      name: field,
      ...(isBool
        ? { defaultChecked: Boolean(value) }
        : Array.isArray(value) ? {}
        : { defaultValue: value instanceof Date ? this.formatLocalDateTime(value) : String(value ?? "") }),
      onBlur: () => {
        this.syncRefToState(field);
        this.handleBlur(field);
      },
      onChange: () => {
        this.syncRefToState(field);
        this.handleChange(field);
      },
    };
  }

  /** Read all current values, including any pending DOM input not yet synced to state. */
  getValues(): V {
    const stateValues = this.state.get("values");
    const merged = { ...stateValues };
    for (const [field, el] of this._refs) {
      (merged as any)[field] = this.coerceRefValue(field, el);
    }
    for (const [field] of this._radioRefs) {
      (merged as any)[field] = this.coerceRadioValue(field);
    }
    return merged as V;
  }

  /** Read a single field's current value, including any pending DOM input. */
  getValue(field: keyof V & string): V[typeof field] {
    if (this._radioRefs.has(field)) {
      return this.coerceRadioValue(field) as V[typeof field];
    }
    const el = this._refs.get(field);
    if (el) return this.coerceRefValue(field, el) as V[typeof field];
    return this.state.get(`values.${field}` as any);
  }

  /** Programmatically set a field's value. Also syncs the DOM element and triggers change validation. */
  setValue<F extends keyof V & string>(field: F, value: V[F]): void {
    this.state.set(`values.${field}` as any, value);
    this.syncValueToDom(field, value);
    this.handleChange(field);
  }

  /** Trigger blur-time validation if `validationMode` is `"onBlur"`. */
  handleBlur(field: keyof V & string): void {
    if (this.formConfig.validationMode === "onBlur") {
      this.validateField(field);
    }
  }

  /** Trigger change-time validation if `validationMode` is `"onChange"`. */
  handleChange(field: keyof V & string): void {
    if (this.formConfig.validationMode === "onChange") {
      this.validateField(field);
    }
  }

  /** Check if a single field's value differs from its initial value. */
  isFieldDirty(field: keyof V & string): boolean {
    return !this.valuesEqual(
      this.state.get(`values.${field}` as any),
      this.state.get(`initial.${field}` as any),
    );
  }

  /** Manually add an error message to a field (appended to existing errors). */
  setError(field: keyof V & string, message: string): void {
    const errors = this.state.get("errors");
    const existing = errors[field] ?? [];
    this.state.set(`errors.${field}` as any, [...existing, message] as any);
  }

  /** Remove all validation errors. */
  clearErrors(): void {
    this.state.set("errors", {} as FormErrors<V>);
  }

  /** Run the full Zod schema validation. Returns parsed values on success, or `null` on failure (errors are set). */
  validate(): V | null {
    this.syncFromRefs();
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

  /** Validate a single field against its schema. Updates or clears that field's errors. */
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

  /** Reset all fields to their initial values and clear errors. */
  reset(): void {
    const initial = this.state.get("initial");
    this.state.batch(() => {
      this.state.set("values", { ...initial });
      this.state.set("errors", {} as FormErrors<V>);
      this.state.set("submitStatus", { status: asyncStatus("idle"), error: null });
    });
    this.syncToDom();
  }

  /** Clear all fields to empty/zero values (based on type) and clear errors. */
  clear(): void {
    const initial = this.state.get("initial");
    const shapeKeys = this.objectSchema ? Object.keys(this.objectSchema.shape) : [];
    const allKeys = new Set([...Object.keys(initial), ...shapeKeys]);
    const empty = [...allKeys].reduce(
      (acc, key) => {
        const val = initial[key];
        if (val === undefined || val === null) {
          const ft = this.getFieldType(key);
          if (ft === "number") { (acc as any)[key] = 0; }
          else if (ft === "boolean") { (acc as any)[key] = false; }
          else if (ft === "null") { (acc as any)[key] = null; }
          else if (val === null && ft === "string") { (acc as any)[key] = ""; }
          else if (val === null && ft === "date") { (acc as any)[key] = null; }
          else if (val === null && ft === "array") { (acc as any)[key] = []; }
          else if (val === null && (ft === "object" || ft === "record")) { (acc as any)[key] = {}; }
          else { (acc as any)[key] = val; }
        } else if (val instanceof Date) { (acc as any)[key] = null; }
        else if (typeof val === "number") { (acc as any)[key] = 0; }
        else if (typeof val === "boolean") { (acc as any)[key] = false; }
        else if (Array.isArray(val)) { (acc as any)[key] = []; }
        else if (typeof val === "object") { (acc as any)[key] = {}; }
        else { (acc as any)[key] = ""; }
        return acc;
      },
      {} as V,
    );
    this.state.batch(() => {
      this.state.set("values", empty);
      this.state.set("errors", {} as FormErrors<V>);
    });
    this.syncToDom();
  }

  /** Update initial values and reset the form to them. Useful for populating from an API response. */
  setInitialValues(values: Partial<V>): void {
    const current = this.state.get("initial");
    const merged = { ...current, ...values } as V;
    this.state.batch(() => {
      this.state.set("values", { ...merged });
      this.state.set("initial", merged);
    });
    this.syncToDom();
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return false;
  }

  private getFieldType(field: string): string {
    const initial = this.state.get("initial");
    const val = initial[field];
    if (val instanceof Date) { return "date"; }
    if (Array.isArray(val)) { return "array"; }
    if (val !== undefined && val !== null) { return typeof val; }
    if (this.objectSchema) {
      const base = getBaseSchemaType(this.objectSchema.shape[field]);
      if (base) { return base; }
    }
    return "string";
  }

  private getArrayItemType(field: string): string {
    const initial = this.state.get("initial");
    const val = initial[field];
    if (Array.isArray(val) && val.length > 0) return typeof val[0];
    if (this.objectSchema) {
      let schema: any = this.objectSchema.shape[field];
      while (schema?._zod?.def) {
        if (schema._zod.def.type === "array") {
          const itemType = getBaseSchemaType(schema._zod.def.element);
          if (itemType) return itemType;
          break;
        }
        schema = schema._zod.def.innerType ?? schema._zod.def.in;
        if (!schema) break;
      }
    }
    return "string";
  }

  private getRadioValue(field: string): string | undefined {
    const set = this._radioRefs.get(field);
    if (!set) return undefined;
    for (const el of set) {
      if ((el as HTMLInputElement).checked) return el.value;
    }
    return undefined;
  }

  private formatLocalDateTime(date: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  }

  private formatDateForInput(el: HTMLInputElement, date: Date): string {
    const full = this.formatLocalDateTime(date);
    if (el.type === "datetime-local") return full;
    if (el.type === "time") return full.slice(11);
    return full.slice(0, 10);
  }

  private coerceStringValue(field: string, raw: string): unknown {
    const typ = this.getFieldType(field);
    if (typ === "number") return raw === "" ? NaN : Number(raw);
    if (typ === "date") {
      if (raw === "") return null;
      // HH:MM (time input) — set hours/minutes on today's date
      if (/^\d{2}:\d{2}$/.test(raw)) {
        const [h, m] = raw.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
      }
      // YYYY-MM-DD (date input) — append T00:00:00 to parse as local, not UTC
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        raw = raw + "T00:00:00";
      }
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    return raw;
  }

  private coerceRadioValue(field: string): unknown {
    const raw = this.getRadioValue(field);
    if (raw === undefined) return undefined;
    return this.coerceStringValue(field, raw);
  }

  private coerceRefValue(field: string, el: FormElement): unknown {
    if (el instanceof HTMLInputElement && el.type === "file") {
      if (el.files && el.files.length > 0) {
        return el.multiple ? Array.from(el.files) : el.files[0];
      }
      return this.state.get(`values.${field}` as any);
    }
    const typ = this.getFieldType(field);
    if (typ === "boolean") { return (el as HTMLInputElement).checked; }
    if (typ === "array" && el instanceof HTMLSelectElement && el.multiple) {
      const itemType = this.getArrayItemType(field);
      return Array.from(el.selectedOptions, (o) =>
        itemType === "number" ? (o.value === "" ? NaN : Number(o.value)) : o.value,
      );
    }
    return this.coerceStringValue(field, el.value);
  }

  private syncRefToState(field: keyof V & string): void {
    if (this._radioRefs.has(field)) {
      const val = this.coerceRadioValue(field);
      if (val !== undefined) {
        this.state.set(`values.${field}` as any, val as any);
      }
      return;
    }
    const el = this._refs.get(field);
    if (!el) { return; }
    this.state.set(`values.${field}` as any, this.coerceRefValue(field, el) as any);
  }

  private syncFromRefs(): void {
    if (this._refs.size === 0 && this._radioRefs.size === 0) return;
    this.state.batch(() => {
      for (const [field, el] of this._refs) {
        this.state.set(`values.${field}` as any, this.coerceRefValue(field, el) as any);
      }
      for (const [field] of this._radioRefs) {
        const val = this.coerceRadioValue(field);
        if (val !== undefined) {
          this.state.set(`values.${field}` as any, val as any);
        }
      }
    });
  }

  private syncValueToDom(field: string, value: unknown): void {
    const radioSet = this._radioRefs.get(field);
    if (radioSet) {
      const strVal = String(value ?? "");
      for (const el of radioSet) {
        (el as HTMLInputElement).checked = el.value === strVal;
      }
      return;
    }
    const el = this._refs.get(field);
    if (!el) { return; }
    if (el instanceof HTMLInputElement && el.type === "file") {
      if (value == null || (Array.isArray(value) && value.length === 0)) el.value = "";
      return;
    }
    const ft = this.getFieldType(field);
    if (ft === "boolean") {
      (el as HTMLInputElement).checked = Boolean(value);
    } else if (ft === "date" && value instanceof Date) {
      el.value = this.formatDateForInput(el as HTMLInputElement, value);
    } else if (ft === "array" && el instanceof HTMLSelectElement && el.multiple && Array.isArray(value)) {
      const vals = new Set(value.map(String));
      for (let i = 0; i < el.options.length; i++) {
        el.options[i].selected = vals.has(el.options[i].value);
      }
    } else {
      el.value = String(value ?? "");
    }
  }

  private syncToDom(): void {
    if (this._refs.size === 0 && this._radioRefs.size === 0) return;
    const values = this.state.get("values");
    for (const [field] of this._refs) {
      this.syncValueToDom(field, (values as any)[field]);
    }
    for (const [field] of this._radioRefs) {
      this.syncValueToDom(field, (values as any)[field]);
    }
  }

  /**
   * Validate and submit the form. Returns `undefined` if validation fails.
   * Status is tracked under `key` and reflected in `submitStatus`.
   * Use `this.http` for HTTP calls inside the handler -- using `this.api.*` causes double status tracking.
   * @example await form.submit("save", values => this.http.request("/users", { method: "POST", body: values }))
   */
  submit(
    key: K,
    handler: (values: V) => Promise<void>,
  ): Promise<void> | undefined {
    const data = this.validate();
    if (!data) return undefined;
    const promise = this.api.fetch({ key, fn: () => handler(data) });
    this.syncSubmitStatus(key);
    return promise;
  }

  /** Keep `submitStatus` in sync with the api operation tracked under `key`. */
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
      if (s.isReady || s.isError) unsub();
    });
  }
}
