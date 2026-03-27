# Roadmap

## Form Element Support

### Supported

| Element | How it works |
|---|---|
| `<input type="text">` (and `password`, `email`, `url`, `tel`, `search`) | `el.value` read/write |
| `<input type="number">` | Coerced via `Number(el.value)` when initial value is `number` |
| `<input type="checkbox">` | `el.checked` / `defaultChecked` when initial value is `boolean` |
| `<textarea>` | `el.value` read/write |
| `<select>` | `el.value` read/write |
| `<input type="range">` | Coerced via `Number(el.value)` when initial value is `number`; browser handles clamping |

### To be implemented

| Element | What's missing |
|---|---|
| `<input type="radio">` | Multiple elements share one field name; `register()` stores one ref per field |
| `<select multiple>` | `el.value` only returns first selection; needs `el.selectedOptions` to produce an array |
| `<input type="file">` | `el.value` gives a fake path; needs `el.files` to return a `FileList` |
| `<input type="date">` / `time` / `datetime-local` | Works as string via `el.value`, but no `Date` coercion in `coerceRefValue` |
