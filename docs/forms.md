---
title: Forms
description: Zod-powered form stores with validation, DOM binding, and async submission
---

# Forms

Snapstate includes a Zod-powered form module for type-safe form management with validation, DOM binding, and async submission.

```typescript
import { SnapFormStore } from "@thalesfp/snapstate/form";
```

Requires `zod >= 3` as a peer dependency.

## Creating a Form Store

```typescript
import { z } from "zod";
import { SnapFormStore } from "@thalesfp/snapstate/form";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

type Values = z.infer<typeof schema>;

class ContactForm extends SnapFormStore<Values, "save"> {
  async save() {
    await this.submit("save", async (values) => {
      await this.api.post("save", "/api/contacts", { body: values });
    });
  }
}

const form = new ContactForm(schema, { name: "", email: "" });
```

### Configuration

The third constructor argument accepts:

| Option | Values | Description |
| --- | --- | --- |
| `validationMode` | `"onSubmit"` \| `"onBlur"` \| `"onChange"` | When to trigger field validation |

## Binding to Inputs

`register(field)` returns props for binding to DOM inputs:

```tsx
function ContactFormView({ form }: { form: ContactForm }) {
  return (
    <form>
      <input {...form.register("name")} />
      <input {...form.register("email")} type="email" />
    </form>
  );
}
```

`register` handles text, checkbox, radio, select (including multi-select), file, and date/time inputs. It returns `ref`, `name`, `defaultValue`/`defaultChecked`, `onBlur`, and `onChange` handlers based on the validation mode.

## Reading and Setting Values

```typescript
form.values;            // current form values
form.getValue("name");  // single field
form.getValues();       // merged state + DOM ref values

form.setValue("name", "Alice");  // programmatic set + DOM sync
```

## Validation

### Full Validation

```typescript
const parsed = form.validate();
if (parsed) {
  // parsed is the Zod-validated data
}
// form.errors now contains any validation errors
```

### Per-Field Validation

```typescript
form.validateField("email");
```

### Error Management

```typescript
form.errors;              // { name?: string[], email?: string[] }
form.isValid;             // true if no errors
form.setError("email", "Already taken");
form.clearErrors();
```

## Dirty Tracking

```typescript
form.isDirty;                // any field differs from initial?
form.isFieldDirty("name");   // specific field dirty?
```

## Submission

`submit(key, handler)` validates first, then runs the handler. Use `this.http` for HTTP calls inside the handler -- `this.api.*` methods cause double status tracking on the same key:

```typescript
async save() {
  await this.submit("save", async (values) => {
    await this.http.request("/api/save", { method: "POST", body: values });
  });
}
```

Submit status is tracked as an async operation:

```typescript
form.getStatus("save").status.isLoading; // true during submission
```

If validation fails, `submit` returns `undefined` without calling the handler.

## Reset and Clear

```typescript
form.reset();   // restore to initial values, clear errors and submit status
form.clear();   // zero out all fields to type-appropriate defaults
```

## Updating Initial Values

```typescript
form.setInitialValues({ name: "Pre-filled" });
// Updates both initial and current values, syncs DOM refs
```

## Connecting to React

`SnapFormStore` extends the React-enabled `SnapStore`, so you can use `connect`:

```tsx
const ConnectedForm = form.connect(ContactFormView, (store) => ({
  values: store.values,
  errors: store.errors,
  isDirty: store.isDirty,
}));
```
