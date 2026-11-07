# DBML acceptance

Before paragraph.

~~~~dbml
Table "accounting"."Kunden" {
  "Länderkennung" varchar(2) [not null]
  nummer int [not null]
  name varchar(100)
  indexes {
    ("Länderkennung", nummer) [pk]
    (name, nummer) [unique]
  }
}
Table public.orders {
  land varchar(2) [not null]
  kunde int [not null]
  id int [pk]
}
Ref: public.orders.(land, kunde) > "accounting"."Kunden".("Länderkennung", nummer)
~~~~

After paragraph.
