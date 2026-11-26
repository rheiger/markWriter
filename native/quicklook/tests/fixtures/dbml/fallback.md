# Finder DBML fallback

Unsupported default:

```dbml
Table example {
  id int [default: 1]
}
```

Invalid reference:

```dbml
Table child {
  parent_id int [ref: > missing.id]
}
```
