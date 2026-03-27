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
});
