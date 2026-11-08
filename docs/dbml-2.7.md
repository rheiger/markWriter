# Offline DBML in MarkWriter 2.7

Put a schema in a fenced `dbml` block. MarkWriter displays it in Preview, as an opaque diagram in WYSIWYG, and as inline SVG in standalone HTML. Edit the fence in Markdown. An invalid or unsupported schema shows a diagnostic in the editor. HTML export reports a failure before writing a file.

````markdown
```dbml
Table accounting.customers {
  id int [pk]
}
Table orders {
  customer_id int [not null]
}
Ref: orders.customer_id > accounting.customers.id
```
````

The supported subset covers schema-qualified and double-quoted Unicode names, column types, primary and unique keys, nullability, composite key indexes, and short or inline references. Edges identify both column sets and the declared cardinality. See the [representative composite schema](../tools/fixtures/dbml-2.7.md). Aliases, notes, defaults, enums, relationship settings and other DBML constructs outside this subset produce diagnostics. All processing uses local resources.

Each fence is limited to 32 KiB of UTF-8, 40 tables, 400 columns and 100 relationships. MarkWriter runs up to four parses at a time, queues up to 32 waiting parses, and gives each worker one second. The generated graph shares DOT’s 64 KiB input, two-second layout and 2 MiB SVG limits. HTML export has a ten-second budget for DBML diagrams. These limits bound work and can reject dense schemas below the individual count limits.

The DBML feature is scoped to the application and its HTML export. See the [installation guide](install-2.7.0.md) for package and provider boundaries.
