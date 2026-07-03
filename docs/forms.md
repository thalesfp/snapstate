---
title: Forms
description: Zod-powered form stores with validation, DOM binding, and async submission
---

# Forms

`SnapFormStore<V, K>` extends the React-enabled `SnapStore` with Zod validation, DOM binding, and a submit lifecycle. Use it whenever the main concern is form values, validation, and submission.

```typescript
import { SnapFormStore } from "@snapstore/form";
```

Requires `zod >= 4` as a peer dependency.

## Creating a Form Store

```typescript
import { z } from "zod";
import { SnapFormStore } from "@snapstore/form";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

type Values = z.infer<typeof schema>;

class ContactForm extends SnapFormStore<Values, "save"> {
  constructor() {
    super(schema, { name: "", email: "" }, { validationMode: "onBlur" });
  }

  save() {
    return this.submit("save", async (values) => {
      await this.http.request("/api/contacts", { method: "POST", body: values });
    });
  }
}

const form = new ContactForm();
```

Inside a `submit` handler, use `this.http` for the request. The submit is already tracked under the key, so `this.api.*` with the same key would double-track it.

### Validation modes

The third constructor argument sets when field validation runs:

| Mode | Behavior | Choose it when |
| --- | --- | --- |
| `onSubmit` (default) | Validate only when `submit()` runs | Short forms; least noisy |
| `onBlur` | Validate a field when it loses focus | Most forms; errors appear once the user finishes a field |
| `onChange` | Validate on every change | Live feedback such as password strength |

## Binding to Inputs

`register(field)` returns props to spread onto native form elements. It handles refs, initial values, and event binding:

```tsx
function ContactFormView({ errors }: { errors: FormErrors<Values> }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); form.save()?.catch(() => {}); }}>
      <input {...form.register("name")} />
      {errors.name && <span>{errors.name[0]}</span>}

      <input {...form.register("email")} type="email" />
      {errors.email && <span>{errors.email[0]}</span>}

      <button type="submit">Save</button>
    </form>
  );
}
```

Supported elements: text, number, checkbox, radio, textarea, select (including multiple), range, date/time/datetime-local, and file inputs. Values are coerced back to the schema's types: a number field reads as `number`, a date input as `Date`, a multi-select of numbers as `number[]`.

## Reading and Setting Values

```typescript
form.values;            // current values from state
form.getValue("name");  // one field, including unsynced DOM input
form.getValues();       // all fields, including unsynced DOM input

form.setValue("name", "Alice");  // programmatic set + DOM sync + change validation
```

## Validation

```typescript
const parsed = form.validate();  // full schema; returns parsed values or null
if (parsed) {
  // parsed is the Zod output type
}

form.validateField("email");     // one field

form.errors;                     // { name?: string[], email?: string[] }
form.isValid;                    // no errors present
form.setError("email", "Already taken");  // append a manual error
form.clearErrors();
```

## Dirty Tracking

```typescript
form.isDirty;               // any field differs from initial values
form.isFieldDirty("name");  // one field
```

Comparison is aware of `Date` objects and arrays, so a date field is not dirty just because a new `Date` instance holds the same timestamp.

## Submission

`submit(key, handler)` validates first. If validation fails, it returns `undefined` without calling the handler. Otherwise it runs the handler with the parsed values under status tracking:

```typescript
save() {
  return this.submit("save", async (values) => {
    await this.http.request("/api/save", { method: "POST", body: values });
  });
}
```

Track the status through state or `getStatus`:

```typescript
form.getStatus("save").status.isLoading; // true during submission
```

Two practices to follow:

- **Handle the returned promise.** It rejects when the handler throws; await it in `try/catch` or attach `.catch()`, even if your UI reads the outcome from status.
- **Disable the submit button while `isLoading`.** Submissions are not deduplicated automatically; a double click runs the handler twice.

## Reset and Clear

```typescript
form.reset();   // back to initial values; clears errors and submit status
form.clear();   // empty every field to a type-appropriate zero value
```

## Updating Initial Values

Populate the form from an API response. Updates both initial and current values and syncs the DOM:

```typescript
form.setInitialValues({ name: "Pre-filled" });
```

## Connecting to React

`SnapFormStore` is a full `SnapStore`, so `connect()` works as usual. Map errors, dirty state, and submit status into props:

```tsx
const ConnectedForm = form.connect(ContactFormView, (s) => ({
  errors: s.errors,
  isDirty: s.isDirty,
  submitting: s.getStatus("save").status.isLoading,
}));
```

For a form that should reset every time it mounts, wrap it with `SnapStore.scoped()` and a factory that builds a fresh form store.
