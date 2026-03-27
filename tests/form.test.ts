import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { SnapFormStore, getObjectSchema, getBaseSchemaType } from "../src/form/form.js";
import { setHttpClient } from "../src/core/base.js";
import { asyncStatus } from "../src/core/types.js";
import type { HttpClient } from "../src/core/types.js";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

type Values = z.infer<typeof schema>;

class TestForm extends SnapFormStore<Values, "save"> {}

describe("getObjectSchema", () => {
  it("returns ZodObject directly", () => {
    const obj = z.object({ a: z.string() });
    expect(getObjectSchema(obj)).toBe(obj);
  });

  it("unwraps ZodPipe (transform)", () => {
    const obj = z.object({ a: z.string() });
    const transformed = obj.transform((d) => ({ ...d, b: 1 }));
    const result = getObjectSchema(transformed);
    expect(result).toBe(obj);
  });

  it("returns null for non-object schemas", () => {
    expect(getObjectSchema(z.string())).toBeNull();
  });
});

describe("getBaseSchemaType", () => {
  it("returns base type for simple schemas", () => {
    expect(getBaseSchemaType(z.string())).toBe("string");
    expect(getBaseSchemaType(z.number())).toBe("number");
    expect(getBaseSchemaType(z.boolean())).toBe("boolean");
  });

  it("unwraps .optional()", () => {
    expect(getBaseSchemaType(z.boolean().optional())).toBe("boolean");
  });

  it("unwraps .nullable()", () => {
    expect(getBaseSchemaType(z.number().nullable())).toBe("number");
  });

  it("unwraps .default()", () => {
    expect(getBaseSchemaType(z.string().default("hi"))).toBe("string");
  });

  it("unwraps nested wrappers", () => {
    expect(getBaseSchemaType(z.boolean().optional().nullable())).toBe("boolean");
  });

  it("unwraps pipe/transform via .in", () => {
    const piped = z.string().transform((s) => Number(s));
    expect(getBaseSchemaType(piped)).toBe("string");
  });

  it("resolves literal to underlying primitive type", () => {
    expect(getBaseSchemaType(z.literal(true))).toBe("boolean");
    expect(getBaseSchemaType(z.literal(42))).toBe("number");
    expect(getBaseSchemaType(z.literal("x"))).toBe("string");
  });

  it("resolves z.literal(null) to null", () => {
    expect(getBaseSchemaType(z.literal(null))).toBe("null");
  });

  it("returns null for bad input", () => {
    expect(getBaseSchemaType(null)).toBeNull();
    expect(getBaseSchemaType(undefined)).toBeNull();
    expect(getBaseSchemaType(42)).toBeNull();
    expect(getBaseSchemaType({})).toBeNull();
  });
});

describe("SnapFormStore", () => {
  let form: TestForm;

  beforeEach(() => {
    form = new TestForm(schema, { name: "", email: "" });
  });

  describe("constructor", () => {
    it("initializes with provided values", () => {
      expect(form.values).toEqual({ name: "", email: "" });
    });

    it("starts with no errors", () => {
      expect(form.errors).toEqual({});
    });

    it("starts as not dirty", () => {
      expect(form.isDirty).toBe(false);
    });

    it("starts as valid (no errors)", () => {
      expect(form.isValid).toBe(true);
    });

    it("starts with idle submitStatus", () => {
      const ss = form.state.get("submitStatus");
      expect(ss.status.isIdle).toBe(true);
      expect(ss.error).toBeNull();
    });
  });

  describe("setValue", () => {
    it("updates a field value", () => {
      form.setValue("name", "John");
      expect(form.values.name).toBe("John");
    });

    it("does not affect other fields", () => {
      form.setValue("name", "John");
      expect(form.values.email).toBe("");
    });

    it("does not validate in onSubmit mode", () => {
      form.setValue("email", "invalid");
      expect(form.errors).toEqual({});
    });
  });

  describe("isDirty / isFieldDirty", () => {
    it("becomes dirty after setValue", () => {
      form.setValue("name", "John");
      expect(form.isDirty).toBe(true);
    });

    it("reports individual field dirty state", () => {
      form.setValue("name", "John");
      expect(form.isFieldDirty("name")).toBe(true);
      expect(form.isFieldDirty("email")).toBe(false);
    });

    it("is not dirty when value matches initial", () => {
      form.setValue("name", "John");
      form.setValue("name", "");
      expect(form.isFieldDirty("name")).toBe(false);
      expect(form.isDirty).toBe(false);
    });
  });

  describe("validate", () => {
    it("returns parsed data on valid input", () => {
      form.setValue("name", "John");
      form.setValue("email", "john@example.com");
      const data = form.validate();
      expect(data).toEqual({ name: "John", email: "john@example.com" });
    });

    it("returns null and sets errors on invalid input", () => {
      const data = form.validate();
      expect(data).toBeNull();
      expect(form.errors.name).toBeDefined();
      expect(form.errors.email).toBeDefined();
    });

    it("clears errors on successful validation", () => {
      form.validate();
      expect(form.isValid).toBe(false);

      form.setValue("name", "John");
      form.setValue("email", "john@example.com");
      form.validate();
      expect(form.isValid).toBe(true);
      expect(form.errors).toEqual({});
    });

    it("collects multiple errors per field", () => {
      const strict = z.object({
        name: z.string().min(1, "Required").max(2, "Too long"),
      });
      const f = new SnapFormStore(strict, { name: "abcdef" });
      // "abcdef" passes min(1) but fails max(2)
      f.validate();
      // Only the max error should appear since min passes
      expect(f.errors.name).toEqual(["Too long"]);
    });
  });

  describe("validateField", () => {
    it("validates a single field", () => {
      form.validateField("email");
      expect(form.errors.email).toBeDefined();
      expect(form.errors.name).toBeUndefined();
    });

    it("clears field error when valid", () => {
      form.validateField("email");
      expect(form.errors.email).toBeDefined();

      form.setValue("email", "valid@example.com");
      form.validateField("email");
      expect(form.errors.email).toBeUndefined();
    });
  });

  describe("validationMode: onBlur", () => {
    let blurForm: TestForm;

    beforeEach(() => {
      blurForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onBlur",
      });
    });

    it("does not validate on setValue", () => {
      blurForm.setValue("email", "bad");
      expect(blurForm.errors).toEqual({});
    });

    it("validates on handleBlur", () => {
      blurForm.setValue("email", "bad");
      blurForm.handleBlur("email");
      expect(blurForm.errors.email).toBeDefined();
    });
  });

  describe("validationMode: onChange", () => {
    let changeForm: TestForm;

    beforeEach(() => {
      changeForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onChange",
      });
    });

    it("validates immediately on setValue", () => {
      changeForm.setValue("email", "bad");
      expect(changeForm.errors.email).toBeDefined();
    });

    it("clears error when field becomes valid", () => {
      changeForm.setValue("email", "bad");
      expect(changeForm.errors.email).toBeDefined();
      changeForm.setValue("email", "good@example.com");
      expect(changeForm.errors.email).toBeUndefined();
    });
  });

  describe("setError / clearErrors", () => {
    it("appends a custom error to a field", () => {
      form.setError("email", "Already taken");
      expect(form.errors.email).toEqual(["Already taken"]);
    });

    it("appends to existing errors", () => {
      form.setError("email", "Error 1");
      form.setError("email", "Error 2");
      expect(form.errors.email).toEqual(["Error 1", "Error 2"]);
    });

    it("clearErrors removes all errors", () => {
      form.setError("name", "Bad");
      form.setError("email", "Bad");
      form.clearErrors();
      expect(form.errors).toEqual({});
      expect(form.isValid).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets values to initial", () => {
      form.setValue("name", "Changed");
      form.reset();
      expect(form.values).toEqual({ name: "", email: "" });
    });

    it("clears errors", () => {
      form.setError("name", "Bad");
      form.reset();
      expect(form.errors).toEqual({});
    });

    it("resets submitStatus to idle", () => {
      form.state.set("submitStatus", { status: asyncStatus("ready"), error: null });
      form.reset();
      expect(form.state.get("submitStatus").status.isIdle).toBe(true);
      expect(form.state.get("submitStatus").error).toBeNull();
    });

    it("is not dirty after reset", () => {
      form.setValue("name", "Changed");
      form.reset();
      expect(form.isDirty).toBe(false);
    });
  });

  describe("clear", () => {
    it("empties all values", () => {
      form.setValue("name", "John");
      form.setValue("email", "john@example.com");
      form.clear();
      expect(form.values).toEqual({ name: "", email: "" });
    });

    it("clears errors", () => {
      form.setError("name", "Bad");
      form.clear();
      expect(form.errors).toEqual({});
    });

    it("produces {} for object fields", () => {
      const objSchema = z.object({ meta: z.record(z.unknown()) });
      type ObjValues = { meta: Record<string, unknown> };
      const objForm = new SnapFormStore<ObjValues>(objSchema, { meta: { foo: 1 } });
      objForm.clear();
      expect(objForm.values.meta).toEqual({});
    });

    it("derives zero-values from initial value types", () => {
      const mixedSchema = z.object({
        label: z.string(),
        count: z.number(),
        active: z.boolean(),
        tags: z.array(z.string()),
        meta: z.any(),
      });
      type Mixed = { label: string; count: number; active: boolean; tags: string[]; meta: null };
      const mixedForm = new SnapFormStore<Mixed>(mixedSchema, {
        label: "hello",
        count: 5,
        active: true,
        tags: ["a", "b"],
        meta: null,
      });
      mixedForm.clear();
      expect(mixedForm.values).toEqual({
        label: "",
        count: 0,
        active: false,
        tags: [],
        meta: null,
      });
    });
  });

  describe("setInitialValues", () => {
    it("updates both values and initial", () => {
      form.setInitialValues({ name: "John", email: "john@example.com" });
      expect(form.values).toEqual({ name: "John", email: "john@example.com" });
      expect(form.state.get("initial")).toEqual({
        name: "John",
        email: "john@example.com",
      });
    });

    it("resets dirty state", () => {
      form.setValue("name", "John");
      expect(form.isDirty).toBe(true);
      form.setInitialValues({ name: "John" });
      expect(form.isDirty).toBe(false);
    });

    it("supports partial updates", () => {
      form.setInitialValues({ name: "John" });
      expect(form.values).toEqual({ name: "John", email: "" });
    });
  });

  describe("submit", () => {
    beforeEach(() => {
      setHttpClient({
        request: (async () => {}) as HttpClient["request"],
      });
    });

    it("returns undefined when validation fails", () => {
      const handler = vi.fn();
      const result = form.submit("save", handler);
      expect(result).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    });

    it("calls handler with validated data", async () => {
      form.setValue("name", "John");
      form.setValue("email", "john@example.com");
      const handler = vi.fn().mockResolvedValue(undefined);
      await form.submit("save", handler);
      expect(handler).toHaveBeenCalledWith({
        name: "John",
        email: "john@example.com",
      });
    });

    it("mirrors submit status", async () => {
      form.setValue("name", "John");
      form.setValue("email", "john@example.com");
      let resolve!: () => void;
      const handler = () => new Promise<void>((r) => { resolve = r; });
      const promise = form.submit("save", handler);
      expect(form.getStatus("save").status.isLoading).toBe(true);
      // After microtask, submitStatus should sync
      await new Promise((r) => setTimeout(r, 0));
      expect(form.state.get("submitStatus").status.isLoading).toBe(true);
      resolve();
      await promise;
      await new Promise((r) => setTimeout(r, 0));
      expect(form.state.get("submitStatus").status.isReady).toBe(true);
    });
  });

  describe("register", () => {
    it("returns ref, name, defaultValue, onBlur", () => {
      form.setValue("name", "John");
      const reg = form.register("name");
      expect(reg.name).toBe("name");
      expect(reg.defaultValue).toBe("John");
      expect(typeof reg.ref).toBe("function");
      expect(typeof reg.onBlur).toBe("function");
    });

    it("ref callback stores and removes element", () => {
      const reg = form.register("name");
      const el = document.createElement("input");
      reg.ref(el);
      expect(form.getValue("name")).toBe("");
      el.value = "typed";
      expect(form.getValue("name")).toBe("typed");
      reg.ref(null);
      expect(form.getValue("name")).toBe("");
    });

    it("onBlur syncs DOM value to state", () => {
      const reg = form.register("name");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "typed";
      reg.onBlur();
      expect(form.values.name).toBe("typed");
    });

    it("onBlur triggers validation in onBlur mode", () => {
      const blurForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onBlur",
      });
      const reg = blurForm.register("email");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "bad";
      reg.onBlur();
      expect(blurForm.errors.email).toBeDefined();
    });
  });

  describe("register onChange", () => {
    it("triggers validation in onChange mode", () => {
      const changeForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onChange",
      });
      const reg = changeForm.register("email");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "bad";
      reg.onChange();
      expect(changeForm.errors.email).toBeDefined();
    });

    it("clears error when field becomes valid", () => {
      const changeForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onChange",
      });
      const reg = changeForm.register("email");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "bad";
      reg.onChange();
      expect(changeForm.errors.email).toBeDefined();
      el.value = "good@example.com";
      reg.onChange();
      expect(changeForm.errors.email).toBeUndefined();
    });
  });

  describe("syncFromRefs type coercion", () => {
    it("coerces number fields from string", () => {
      const numSchema = z.object({ age: z.number().min(1) });
      type NumValues = { age: number };
      const numForm = new SnapFormStore<NumValues>(numSchema, { age: 0 });
      const reg = numForm.register("age");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "25";
      const data = numForm.validate();
      expect(data).toEqual({ age: 25 });
      expect(typeof numForm.values.age).toBe("number");
    });

    it("coerces boolean fields from checked", () => {
      const boolSchema = z.object({ active: z.boolean() });
      type BoolValues = { active: boolean };
      const boolForm = new SnapFormStore<BoolValues>(boolSchema, { active: false });
      const reg = boolForm.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = true;
      const data = boolForm.validate();
      expect(data).toEqual({ active: true });
      expect(typeof boolForm.values.active).toBe("boolean");
    });
  });

  describe("getValues / getValue", () => {
    it("getValues merges DOM ref values over state", () => {
      form.setValue("name", "state-name");
      const reg = form.register("email");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "dom-email";
      const vals = form.getValues();
      expect(vals.name).toBe("state-name");
      expect(vals.email).toBe("dom-email");
    });

    it("getValue returns DOM value for registered field", () => {
      const reg = form.register("name");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "dom-val";
      expect(form.getValue("name")).toBe("dom-val");
    });

    it("getValue falls back to state for unregistered field", () => {
      form.setValue("name", "state-val");
      expect(form.getValue("name")).toBe("state-val");
    });
  });

  describe("syncFromRefs (via validate)", () => {
    it("validate syncs DOM values to state before parsing", () => {
      const reg1 = form.register("name");
      const reg2 = form.register("email");
      const el1 = document.createElement("input");
      const el2 = document.createElement("input");
      reg1.ref(el1);
      reg2.ref(el2);
      el1.value = "John";
      el2.value = "john@example.com";
      const data = form.validate();
      expect(data).toEqual({ name: "John", email: "john@example.com" });
      expect(form.values.name).toBe("John");
      expect(form.values.email).toBe("john@example.com");
    });
  });

  describe("syncToDom (via reset/clear/setInitialValues)", () => {
    let nameEl: HTMLInputElement;
    let emailEl: HTMLInputElement;

    beforeEach(() => {
      nameEl = document.createElement("input");
      emailEl = document.createElement("input");
      form.register("name").ref(nameEl);
      form.register("email").ref(emailEl);
    });

    it("reset pushes initial values to DOM", () => {
      nameEl.value = "dirty";
      form.reset();
      expect(nameEl.value).toBe("");
    });

    it("clear pushes empty values to DOM", () => {
      nameEl.value = "dirty";
      form.clear();
      expect(nameEl.value).toBe("");
    });

    it("setInitialValues pushes new values to DOM", () => {
      form.setInitialValues({ name: "New", email: "new@example.com" });
      expect(nameEl.value).toBe("New");
      expect(emailEl.value).toBe("new@example.com");
    });

    it("setValue updates DOM ref", () => {
      form.setValue("name", "programmatic");
      expect(nameEl.value).toBe("programmatic");
    });
  });

  describe("ref type coercion gaps", () => {
    it("getValue coerces number from ref", () => {
      const numSchema = z.object({ age: z.number() });
      type NumValues = { age: number };
      const numForm = new SnapFormStore<NumValues>(numSchema, { age: 0 });
      const reg = numForm.register("age");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "42";
      expect(numForm.getValue("age")).toBe(42);
      expect(typeof numForm.getValue("age")).toBe("number");
    });

    it("getValues coerces boolean from ref", () => {
      const boolSchema = z.object({ active: z.boolean() });
      type BoolValues = { active: boolean };
      const boolForm = new SnapFormStore<BoolValues>(boolSchema, { active: false });
      const reg = boolForm.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = true;
      expect(boolForm.getValues()).toEqual({ active: true });
    });

    it("setValue sets el.checked for boolean fields", () => {
      const boolSchema = z.object({ active: z.boolean() });
      type BoolValues = { active: boolean };
      const boolForm = new SnapFormStore<BoolValues>(boolSchema, { active: false });
      const reg = boolForm.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      boolForm.setValue("active", true);
      expect(el.checked).toBe(true);
    });

    it("syncToDom sets el.checked on reset", () => {
      const boolSchema = z.object({ active: z.boolean() });
      type BoolValues = { active: boolean };
      const boolForm = new SnapFormStore<BoolValues>(boolSchema, { active: true });
      const reg = boolForm.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = false;
      boolForm.reset();
      expect(el.checked).toBe(true);
    });

    it("register omits defaultValue for boolean fields", () => {
      const boolSchema = z.object({ active: z.boolean() });
      type BoolValues = { active: boolean };
      const boolForm = new SnapFormStore<BoolValues>(boolSchema, { active: true });
      const reg = boolForm.register("active");
      expect(reg.defaultValue).toBeUndefined();
      expect(reg.defaultChecked).toBe(true);
    });

    it("empty number input produces NaN, fails validation", () => {
      const numSchema = z.object({ age: z.number() });
      type NumValues = { age: number };
      const numForm = new SnapFormStore<NumValues>(numSchema, { age: 0 });
      const reg = numForm.register("age");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "";
      const result = numForm.validate();
      expect(result).toBeNull();
      expect(numForm.errors.age).toBeDefined();
    });
  });

  describe("optional field type detection via schema", () => {
    const optSchema = z.object({
      name: z.string(),
      active: z.boolean().optional(),
      count: z.number().optional(),
      label: z.string().optional(),
    });
    type OptValues = { name: string; active?: boolean; count?: number; label?: string };

    it("register returns defaultChecked for optional boolean", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      const reg = f.register("active");
      expect(reg.defaultChecked).toBe(false);
      expect(reg.defaultValue).toBeUndefined();
    });

    it("coerceRefValue returns boolean from .checked for optional boolean", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      const reg = f.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = true;
      expect(f.getValue("active")).toBe(true);
    });

    it("syncValueToDom sets el.checked for optional boolean", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      const reg = f.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      f.setValue("active", true as any);
      expect(el.checked).toBe(true);
    });

    it("coerceRefValue returns number for optional number", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      const reg = f.register("count");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "42";
      expect(f.getValue("count")).toBe(42);
      expect(typeof f.getValue("count")).toBe("number");
    });

    it("register returns defaultValue as string for optional number", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      const reg = f.register("count");
      expect(reg.defaultValue).toBe("");
      expect(reg.defaultChecked).toBeUndefined();
    });
  });

  describe("clear with undefined initials", () => {
    const optSchema = z.object({
      name: z.string(),
      active: z.boolean().optional(),
      count: z.number().optional(),
      label: z.string().optional(),
    });
    type OptValues = { name: string; active?: boolean; count?: number; label?: string };

    it("clears optional number to 0", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      f.clear();
      expect(f.values.count).toBe(0);
    });

    it("clears optional boolean to false", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      f.clear();
      expect(f.values.active).toBe(false);
    });

    it("clears optional string to undefined", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      f.clear();
      expect(f.values.label).toBeUndefined();
    });
  });

  describe("nullable field type detection via schema", () => {
    const nullSchema = z.object({
      name: z.string(),
      active: z.boolean().nullable(),
      count: z.number().nullable(),
    });
    type NullValues = { name: string; active: boolean | null; count: number | null };

    it("register returns defaultChecked for nullable boolean with null initial", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      const reg = f.register("active");
      expect(reg.defaultChecked).toBe(false);
      expect(reg.defaultValue).toBeUndefined();
    });

    it("coerceRefValue returns boolean for nullable boolean with null initial", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      const reg = f.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = true;
      expect(f.getValue("active")).toBe(true);
    });

    it("syncValueToDom sets el.checked for nullable boolean", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      const reg = f.register("active");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      f.setValue("active", true as any);
      expect(el.checked).toBe(true);
    });

    it("coerceRefValue returns number for nullable number with null initial", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      const reg = f.register("count");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "12";
      expect(f.getValue("count")).toBe(12);
      expect(typeof f.getValue("count")).toBe("number");
    });
  });

  describe("clear with null initials", () => {
    const nullSchema = z.object({
      name: z.string(),
      active: z.boolean().nullable(),
      count: z.number().nullable(),
    });
    type NullValues = { name: string; active: boolean | null; count: number | null };

    it("clears nullable number to 0", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      f.clear();
      expect(f.values.count).toBe(0);
    });

    it("clears nullable boolean to false", () => {
      const f = new SnapFormStore<NullValues>(nullSchema, { name: "x", active: null, count: null });
      f.clear();
      expect(f.values.active).toBe(false);
    });
  });

  describe("isDirty with omitted optional fields", () => {
    const optSchema = z.object({
      name: z.string(),
      active: z.boolean().optional(),
      count: z.number().optional(),
    });
    type OptValues = { name: string; active?: boolean; count?: number };

    it("isDirty detects setValue on omitted optional field", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      expect(f.isDirty).toBe(false);
      f.setValue("active", true as any);
      expect(f.isDirty).toBe(true);
    });

    it("isDirty and isFieldDirty agree on omitted optional field", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      f.setValue("count", 5 as any);
      expect(f.isFieldDirty("count")).toBe(true);
      expect(f.isDirty).toBe(true);
    });

    it("isDirty returns false when omitted field is set back to undefined", () => {
      const f = new SnapFormStore<OptValues>(optSchema, { name: "x" } as OptValues);
      f.setValue("active", true as any);
      expect(f.isDirty).toBe(true);
      f.setValue("active", undefined as any);
      expect(f.isDirty).toBe(false);
    });
  });

  describe("clear with z.null() field", () => {
    it("preserves null for z.null() schema fields", () => {
      const nullSchema = z.object({ meta: z.null() });
      type NullFieldValues = { meta: null };
      const f = new SnapFormStore<NullFieldValues>(nullSchema, { meta: null });
      f.clear();
      expect(f.values.meta).toBe(null);
    });
  });

  describe("clear with z.literal(null) field", () => {
    it("preserves null for z.literal(null) schema fields", () => {
      const litNullSchema = z.object({ meta: z.literal(null) });
      type LitNullValues = { meta: null };
      const f = new SnapFormStore<LitNullValues>(litNullSchema, { meta: null });
      f.clear();
      expect(f.values.meta).toBe(null);
      const data = f.validate();
      expect(data).toEqual({ meta: null });
    });
  });

  describe("literal boolean/number via ref flows", () => {
    it("register returns defaultChecked for z.literal(true).optional()", () => {
      const litSchema = z.object({ flag: z.literal(true).optional() });
      type LitValues = { flag?: true };
      const f = new SnapFormStore<LitValues>(litSchema, { flag: undefined } as LitValues);
      const reg = f.register("flag");
      expect(reg.defaultChecked).toBe(false);
      expect(reg.defaultValue).toBeUndefined();
    });

    it("coerceRefValue returns boolean for z.literal(true).optional()", () => {
      const litSchema = z.object({ flag: z.literal(true).optional() });
      type LitValues = { flag?: true };
      const f = new SnapFormStore<LitValues>(litSchema, { flag: undefined } as LitValues);
      const reg = f.register("flag");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      el.checked = true;
      expect(f.getValue("flag")).toBe(true);
    });

    it("syncValueToDom sets el.checked for z.literal(true).optional()", () => {
      const litSchema = z.object({ flag: z.literal(true).optional() });
      type LitValues = { flag?: true };
      const f = new SnapFormStore<LitValues>(litSchema, { flag: undefined } as LitValues);
      const reg = f.register("flag");
      const el = document.createElement("input");
      el.type = "checkbox";
      reg.ref(el);
      f.setValue("flag", true as any);
      expect(el.checked).toBe(true);
    });

    it("coerceRefValue returns number for z.literal(42).optional()", () => {
      const litSchema = z.object({ code: z.literal(42).optional() });
      type LitValues = { code?: 42 };
      const f = new SnapFormStore<LitValues>(litSchema, { code: undefined } as LitValues);
      const reg = f.register("code");
      const el = document.createElement("input");
      reg.ref(el);
      el.value = "42";
      expect(f.getValue("code")).toBe(42);
      expect(typeof f.getValue("code")).toBe("number");
    });
  });

  describe("path-based subscriptions", () => {
    it("notifies on specific value path changes", () => {
      const cb = vi.fn();
      form.subscribe("values.name", cb);
      form.setValue("name", "John");
      // auto-batch fires on microtask
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          resolve();
        }, 0);
      });
    });

    it("does not notify unrelated paths", () => {
      const cb = vi.fn();
      form.subscribe("values.email", cb);
      form.setValue("name", "John");
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cb).not.toHaveBeenCalled();
          resolve();
        }, 0);
      });
    });
  });

  describe("clear with nullable non-number/boolean fields", () => {
    it("clears nullable string to empty string", () => {
      const s = z.object({ label: z.string().nullable() });
      type V = z.infer<typeof s>;
      const f = new SnapFormStore<V>(s, { label: null });
      f.clear();
      expect(f.values.label).toBe("");
      expect(f.errors).toEqual({});
    });

    it("clears nullable array to empty array", () => {
      const s = z.object({ tags: z.array(z.string()).nullable() });
      type V = z.infer<typeof s>;
      const f = new SnapFormStore<V>(s, { tags: null });
      f.clear();
      expect(f.values.tags).toEqual([]);
      expect(f.errors).toEqual({});
    });

    it("clears nullable record to empty object", () => {
      const s = z.object({ meta: z.record(z.unknown()).nullable() });
      type V = z.infer<typeof s>;
      const f = new SnapFormStore<V>(s, { meta: null });
      f.clear();
      expect(f.values.meta).toEqual({});
      expect(f.errors).toEqual({});
    });

    it("clears nullable date to null (no zero value)", () => {
      const s = z.object({ when: z.date().nullable() });
      type V = z.infer<typeof s>;
      const f = new SnapFormStore<V>(s, { when: null });
      f.clear();
      expect(f.values.when).toBeNull();
      expect(f.errors).toEqual({});
    });
  });

  describe("textarea support", () => {
    it("register accepts a textarea ref and reads its value", () => {
      const reg = form.register("name");
      const el = document.createElement("textarea");
      reg.ref(el);
      el.value = "from textarea";
      expect(form.getValue("name")).toBe("from textarea");
    });

    it("setValue writes to textarea DOM value", () => {
      const reg = form.register("name");
      const el = document.createElement("textarea");
      reg.ref(el);
      form.setValue("name", "pushed");
      expect(el.value).toBe("pushed");
    });

    it("onBlur syncs textarea value to state", () => {
      const reg = form.register("name");
      const el = document.createElement("textarea");
      reg.ref(el);
      el.value = "blurred";
      reg.onBlur();
      expect(form.values.name).toBe("blurred");
    });

    it("onChange triggers validation in onChange mode", () => {
      const changeForm = new TestForm(schema, { name: "", email: "" }, {
        validationMode: "onChange",
      });
      const reg = changeForm.register("email");
      const el = document.createElement("textarea");
      reg.ref(el);
      el.value = "bad";
      reg.onChange();
      expect(changeForm.errors.email).toBeDefined();
    });

    it("getValues includes textarea values", () => {
      const nameReg = form.register("name");
      const emailReg = form.register("email");
      const nameEl = document.createElement("textarea");
      const emailEl = document.createElement("input");
      nameReg.ref(nameEl);
      emailReg.ref(emailEl);
      nameEl.value = "textarea name";
      emailEl.value = "input@test.com";
      expect(form.getValues()).toEqual({ name: "textarea name", email: "input@test.com" });
    });

    it("ref removal stops reading from textarea", () => {
      const reg = form.register("name");
      const el = document.createElement("textarea");
      reg.ref(el);
      el.value = "present";
      expect(form.getValue("name")).toBe("present");
      reg.ref(null);
      expect(form.getValue("name")).toBe("");
    });
  });

  describe("range input support", () => {
    const rangeSchema = z.object({ volume: z.number().min(0).max(100) });
    type RangeValues = z.infer<typeof rangeSchema>;

    it("reads numeric value from range input", () => {
      const f = new SnapFormStore<RangeValues>(rangeSchema, { volume: 50 });
      const reg = f.register("volume");
      expect(reg.defaultValue).toBe("50");
      const el = document.createElement("input");
      el.type = "range";
      reg.ref(el);
      el.value = "75";
      expect(f.getValue("volume")).toBe(75);
    });

    it("setValue updates range input DOM value", () => {
      const f = new SnapFormStore<RangeValues>(rangeSchema, { volume: 50 });
      const reg = f.register("volume");
      const el = document.createElement("input");
      el.type = "range";
      reg.ref(el);
      f.setValue("volume", 30);
      expect(el.value).toBe("30");
    });

    it("validates range via schema on blur", () => {
      const strictSchema = z.object({ volume: z.number().min(10).max(90) });
      type StrictValues = z.infer<typeof strictSchema>;
      const f = new SnapFormStore<StrictValues>(strictSchema, { volume: 50 }, {
        validationMode: "onBlur",
      });
      const reg = f.register("volume");
      const el = document.createElement("input");
      el.type = "range";
      reg.ref(el);
      el.value = "0";
      reg.onBlur();
      expect(f.errors.volume).toBeDefined();
    });
  });

  describe("radio button support", () => {
    const radioSchema = z.object({ color: z.string() });
    type RadioValues = z.infer<typeof radioSchema>;

    function createRadioGroup(f: SnapFormStore<RadioValues>, values: string[]) {
      return values.map((v) => {
        const reg = f.register("color");
        const el = document.createElement("input");
        el.type = "radio";
        el.value = v;
        reg.ref(el);
        return { reg, el };
      });
    }

    it("getValue returns the checked radio value", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      radios[1].el.checked = true;
      expect(f.getValue("color")).toBe("green");
    });

    it("getValue returns undefined when no radio is checked", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      createRadioGroup(f, ["red", "green", "blue"]);
      expect(f.getValue("color")).toBeUndefined();
    });

    it("onChange syncs checked radio to state", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" }, {
        validationMode: "onChange",
      });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      radios[2].el.checked = true;
      radios[2].reg.onChange();
      expect(f.values.color).toBe("blue");
    });

    it("onBlur syncs checked radio to state", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      radios[0].el.checked = true;
      radios[0].reg.onBlur();
      expect(f.values.color).toBe("red");
    });

    it("getValues includes radio field values", () => {
      const mixedSchema = z.object({ name: z.string(), color: z.string() });
      type MixedValues = z.infer<typeof mixedSchema>;
      const f = new SnapFormStore<MixedValues>(mixedSchema, { name: "", color: "red" });
      const nameReg = f.register("name");
      const nameEl = document.createElement("input");
      nameReg.ref(nameEl);
      nameEl.value = "Alice";
      const radios = ["red", "green"].map((v) => {
        const reg = f.register("color");
        const el = document.createElement("input");
        el.type = "radio";
        el.value = v;
        reg.ref(el);
        return el;
      });
      radios[1].checked = true;
      expect(f.getValues()).toEqual({ name: "Alice", color: "green" });
    });

    it("setValue updates the correct radio checked state", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      f.setValue("color", "blue");
      expect(radios[0].el.checked).toBe(false);
      expect(radios[1].el.checked).toBe(false);
      expect(radios[2].el.checked).toBe(true);
    });

    it("reset restores initial radio selection", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      f.setValue("color", "blue");
      f.reset();
      expect(radios[0].el.checked).toBe(true);
      expect(radios[1].el.checked).toBe(false);
      expect(radios[2].el.checked).toBe(false);
    });

    it("ref(null) removes only the specific radio element", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      radios[0].reg.ref(null);
      radios[1].el.checked = true;
      expect(f.getValue("color")).toBe("green");
    });

    it("all radios unmounted falls back to state", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green"]);
      radios[0].reg.ref(null);
      radios[1].reg.ref(null);
      expect(f.getValue("color")).toBe("red");
    });

    it("validate includes radio value in parsed data", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "" });
      const radios = createRadioGroup(f, ["red", "green"]);
      radios[0].el.checked = true;
      const data = f.validate();
      expect(data).toEqual({ color: "red" });
    });

    it("clear unchecks all radios", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const radios = createRadioGroup(f, ["red", "green", "blue"]);
      radios[0].el.checked = true;
      f.clear();
      expect(radios[0].el.checked).toBe(false);
      expect(radios[1].el.checked).toBe(false);
      expect(radios[2].el.checked).toBe(false);
    });

    it("numeric radio values are coerced", () => {
      const numSchema = z.object({ level: z.number() });
      type NumValues = z.infer<typeof numSchema>;
      const f = new SnapFormStore<NumValues>(numSchema, { level: 1 });
      const radios = [1, 2, 3].map((v) => {
        const reg = f.register("level");
        const el = document.createElement("input");
        el.type = "radio";
        el.value = String(v);
        reg.ref(el);
        return { reg, el };
      });
      radios[2].el.checked = true;
      expect(f.getValue("level")).toBe(3);
    });

    it("onChange validation fires for radio changes", () => {
      const enumSchema = z.object({ color: z.enum(["red", "green"]) });
      type EnumValues = z.infer<typeof enumSchema>;
      const f = new SnapFormStore<EnumValues>(enumSchema, { color: "red" }, {
        validationMode: "onChange",
      });
      const radios = ["red", "green", "blue"].map((v) => {
        const reg = f.register("color");
        const el = document.createElement("input");
        el.type = "radio";
        el.value = v;
        reg.ref(el);
        return { reg, el };
      });
      radios[2].el.checked = true;
      radios[2].reg.onChange();
      expect(f.errors.color).toBeDefined();
    });

    it("validate preserves state when no radio is checked", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      createRadioGroup(f, ["red", "green", "blue"]);
      const data = f.validate();
      expect(data).toEqual({ color: "red" });
    });

    it("reusing one register() result across multiple radios works", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const reg = f.register("color");
      const els = ["red", "green", "blue"].map((v) => {
        const el = document.createElement("input");
        el.type = "radio";
        el.value = v;
        reg.ref(el);
        return el;
      });
      els[1].checked = true;
      expect(f.getValue("color")).toBe("green");
    });

    it("reused register() ref(null) cleans up all tracked radios", () => {
      const f = new SnapFormStore<RadioValues>(radioSchema, { color: "red" });
      const reg = f.register("color");
      const els = ["red", "green"].map((v) => {
        const el = document.createElement("input");
        el.type = "radio";
        el.value = v;
        reg.ref(el);
        return el;
      });
      reg.ref(null);
      expect(f.getValue("color")).toBe("red");
    });
  });

  describe("date input support", () => {
    const dateSchema = z.object({ when: z.date() });
    type DateValues = z.infer<typeof dateSchema>;

    it("coerces date input value to local Date object", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-06-20";
      const result = f.getValue("when") as Date;
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(20);
      expect(result.getHours()).toBe(0);
    });

    it("coerces datetime-local value to Date object", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-01-15T10:30") });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "datetime-local";
      reg.ref(el);
      el.value = "2025-06-20T14:30";
      expect(f.getValue("when")).toEqual(new Date("2025-06-20T14:30"));
    });

    it("coerces time input value to today-based Date", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-01-15T08:00") });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "time";
      reg.ref(el);
      el.value = "14:30";
      const result = f.getValue("when") as Date;
      expect(result).toBeInstanceOf(Date);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it("returns null for empty date input", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-01-15") });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "";
      expect(f.getValue("when")).toBeNull();
    });

    it("register returns formatted defaultValue for Date", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-03-15T10:30:00Z") });
      const reg = f.register("when");
      expect(reg.defaultValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it("setValue pushes formatted date to DOM", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-01-15") });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      f.setValue("when", new Date(2025, 8, 1));
      expect(el.value).toBe("2025-09-01");
    });

    it("setValue pushes formatted datetime-local to DOM", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date("2025-01-15") });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "datetime-local";
      reg.ref(el);
      f.setValue("when", new Date(2025, 8, 1, 14, 30));
      expect(el.value).toBe("2025-09-01T14:30");
    });

    it("onBlur syncs date input to state", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-12-25";
      reg.onBlur();
      expect((f.values.when as Date).getFullYear()).toBe(2025);
      expect((f.values.when as Date).getMonth()).toBe(11);
      expect((f.values.when as Date).getDate()).toBe(25);
    });

    it("validate parses date field correctly", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-06-20";
      const data = f.validate();
      expect(data).not.toBeNull();
      expect((data!.when as Date).getDate()).toBe(20);
      expect((data!.when as Date).getMonth()).toBe(5);
    });

    it("works with nullable date schema", () => {
      const nullableDateSchema = z.object({ when: z.date().nullable() });
      type NullableDateValues = z.infer<typeof nullableDateSchema>;
      const f = new SnapFormStore<NullableDateValues>(nullableDateSchema, { when: null });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-06-20";
      const result = f.getValue("when") as Date;
      expect(result.getFullYear()).toBe(2025);
      expect(result.getDate()).toBe(20);
    });

    it("reset restores initial date to DOM", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      f.setValue("when", new Date(2025, 5, 20));
      f.reset();
      expect(el.value).toBe("2025-01-15");
    });

    it("clear sets date field to null", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      f.clear();
      expect(f.values.when).toBeNull();
    });

    it("clear sets nullable date field to null", () => {
      const nullableDateSchema = z.object({ when: z.date().nullable() });
      type NullableDateValues = z.infer<typeof nullableDateSchema>;
      const f = new SnapFormStore<NullableDateValues>(nullableDateSchema, { when: null });
      f.clear();
      expect(f.values.when).toBeNull();
    });

    it("returns null for invalid date string", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "not-a-date";
      expect(f.getValue("when")).toBeNull();
    });

    it("isDirty returns false after date round-trip without changes", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-01-15";
      reg.onBlur();
      expect(f.isDirty).toBe(false);
    });

    it("isFieldDirty returns false for unchanged date", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      el.value = "2025-01-15";
      reg.onBlur();
      expect(f.isFieldDirty("when")).toBe(false);
    });

    it("date input gets correctly formatted value on mount", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 5, 20) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "date";
      reg.ref(el);
      expect(el.value).toBe("2025-06-20");
    });

    it("time input gets correctly formatted value on mount", () => {
      const f = new SnapFormStore<DateValues>(dateSchema, { when: new Date(2025, 0, 15, 14, 30) });
      const reg = f.register("when");
      const el = document.createElement("input");
      el.type = "time";
      reg.ref(el);
      expect(el.value).toBe("14:30");
    });
  });

  describe("select multiple support", () => {
    const multiSchema = z.object({ tags: z.array(z.string()) });
    type MultiValues = z.infer<typeof multiSchema>;

    function createMultiSelect(f: SnapFormStore<MultiValues>, options: string[]) {
      const reg = f.register("tags");
      const el = document.createElement("select");
      el.multiple = true;
      for (const v of options) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        el.appendChild(opt);
      }
      reg.ref(el);
      return { reg, el };
    }

    it("getValue reads selected options as array", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      const { el } = createMultiSelect(f, ["a", "b", "c"]);
      (el.options[0] as HTMLOptionElement).selected = true;
      (el.options[2] as HTMLOptionElement).selected = true;
      expect(f.getValue("tags")).toEqual(["a", "c"]);
    });

    it("getValue returns empty array when nothing selected", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      createMultiSelect(f, ["a", "b", "c"]);
      expect(f.getValue("tags")).toEqual([]);
    });

    it("setValue updates selected options", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      const { el } = createMultiSelect(f, ["a", "b", "c"]);
      f.setValue("tags", ["b", "c"]);
      expect((el.options[0] as HTMLOptionElement).selected).toBe(false);
      expect((el.options[1] as HTMLOptionElement).selected).toBe(true);
      expect((el.options[2] as HTMLOptionElement).selected).toBe(true);
    });

    it("onBlur syncs selected options to state", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      const { reg, el } = createMultiSelect(f, ["a", "b", "c"]);
      (el.options[1] as HTMLOptionElement).selected = true;
      reg.onBlur();
      expect(f.values.tags).toEqual(["b"]);
    });

    it("getValues includes multi-select values", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      const { el } = createMultiSelect(f, ["a", "b"]);
      (el.options[0] as HTMLOptionElement).selected = true;
      (el.options[1] as HTMLOptionElement).selected = true;
      expect(f.getValues()).toEqual({ tags: ["a", "b"] });
    });

    it("validate includes multi-select values", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: [] });
      const { el } = createMultiSelect(f, ["a", "b"]);
      (el.options[0] as HTMLOptionElement).selected = true;
      const data = f.validate();
      expect(data).toEqual({ tags: ["a"] });
    });

    it("reset restores initial selection", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["b"] });
      const { el } = createMultiSelect(f, ["a", "b", "c"]);
      f.setValue("tags", ["a", "c"]);
      f.reset();
      expect((el.options[0] as HTMLOptionElement).selected).toBe(false);
      expect((el.options[1] as HTMLOptionElement).selected).toBe(true);
      expect((el.options[2] as HTMLOptionElement).selected).toBe(false);
    });

    it("clear empties the selection", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["a"] });
      const { el } = createMultiSelect(f, ["a", "b"]);
      f.clear();
      expect((el.options[0] as HTMLOptionElement).selected).toBe(false);
      expect((el.options[1] as HTMLOptionElement).selected).toBe(false);
      expect(f.values.tags).toEqual([]);
    });

    it("isDirty returns false after unchanged multi-select round-trip", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["a", "b"] });
      const { reg, el } = createMultiSelect(f, ["a", "b", "c"]);
      (el.options[0] as HTMLOptionElement).selected = true;
      (el.options[1] as HTMLOptionElement).selected = true;
      reg.onBlur();
      expect(f.isDirty).toBe(false);
    });

    it("register omits defaultValue for array fields", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["a", "b"] });
      const reg = f.register("tags");
      expect(reg.defaultValue).toBeUndefined();
    });

    it("initial values are synced to DOM on mount", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["a", "c"] });
      const { el } = createMultiSelect(f, ["a", "b", "c"]);
      expect((el.options[0] as HTMLOptionElement).selected).toBe(true);
      expect((el.options[1] as HTMLOptionElement).selected).toBe(false);
      expect((el.options[2] as HTMLOptionElement).selected).toBe(true);
    });

    it("untouched form preserves initial values through validate", () => {
      const f = new SnapFormStore<MultiValues>(multiSchema, { tags: ["b"] });
      const { el } = createMultiSelect(f, ["a", "b", "c"]);
      const data = f.validate();
      expect(data).toEqual({ tags: ["b"] });
      expect((el.options[1] as HTMLOptionElement).selected).toBe(true);
    });

    it("coerces numeric array values", () => {
      const numSchema = z.object({ ids: z.array(z.number()) });
      type NumValues = z.infer<typeof numSchema>;
      const f = new SnapFormStore<NumValues>(numSchema, { ids: [] });
      const reg = f.register("ids");
      const el = document.createElement("select");
      el.multiple = true;
      for (const v of ["1", "2", "3"]) {
        const opt = document.createElement("option");
        opt.value = v;
        el.appendChild(opt);
      }
      reg.ref(el);
      (el.options[0] as HTMLOptionElement).selected = true;
      (el.options[2] as HTMLOptionElement).selected = true;
      expect(f.getValue("ids")).toEqual([1, 3]);
    });

    it("coerces numeric array values from nullable schema", () => {
      const nullableNumSchema = z.object({ ids: z.array(z.number()).nullable() });
      type NullableNumValues = z.infer<typeof nullableNumSchema>;
      const f = new SnapFormStore<NullableNumValues>(nullableNumSchema, { ids: null });
      const reg = f.register("ids");
      const el = document.createElement("select");
      el.multiple = true;
      for (const v of ["10", "20"]) {
        const opt = document.createElement("option");
        opt.value = v;
        el.appendChild(opt);
      }
      reg.ref(el);
      (el.options[0] as HTMLOptionElement).selected = true;
      (el.options[1] as HTMLOptionElement).selected = true;
      expect(f.getValue("ids")).toEqual([10, 20]);
    });
  });
});
