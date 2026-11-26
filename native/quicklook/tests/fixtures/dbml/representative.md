# Finder DBML representative

```dbml
Table customers {
  id int [pk]
  email varchar(100) [unique, not null]
}
Table orders {
  id int [pk]
  customer_id int [not null, ref: > customers.id]
  total decimal(10,2)
}
```
