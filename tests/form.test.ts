import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { SnapFormStore, getObjectSchema } from "../src/form/form.js";
import { setHttpClient } from "../src/core/base.js";
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
      expect(form.state.get("submitStatus")).toEqual({
        status: "idle",
        error: null,
      });
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
      form.state.set("submitStatus", { status: "ready", error: null });
      form.reset();
      expect(form.state.get("submitStatus")).toEqual({
        status: "idle",
        error: null,
      });
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
      expect(form.getStatus("save").status).toBe("loading");
      // After microtask, submitStatus should sync
      await new Promise((r) => setTimeout(r, 0));
      expect(form.state.get("submitStatus").status).toBe("loading");
      resolve();
      await promise;
      await new Promise((r) => setTimeout(r, 0));
      expect(form.state.get("submitStatus").status).toBe("ready");
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
});
