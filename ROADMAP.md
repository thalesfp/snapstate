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
| `<input type="radio">` | Multiple radios per field via `_radioRefs` map; reads checked element's value |
| `<input type="date">` / `time` / `datetime-local` | Coerced to `Date` object when field type is `date`; formatted for DOM write |
| `<select multiple>` | Reads `el.selectedOptions` as `string[]` when field type is `array`; sets `option.selected` on write |

### To be implemented

| Element | What's missing |
|---|---|
| `<input type="file">` | `el.value` gives a fake path; needs `el.files` to return a `FileList` |
