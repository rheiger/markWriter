# SQL DDL import preview

Open **Insert → Diagram → Import SQL DDL…**. On macOS, **Import SQL DDL…** is directly in the native **Insert** menu. Choose PostgreSQL or SQLite, then select a UTF-8 `.sql` file up to 64 KiB. Review or edit the generated DBML and choose **Append DBML**. MarkWriter checks that it can render the edited DBML before adding one fenced block at the end of the current document. One Undo removes the import. The file, conversion, diagram and HTML export stay local.

The preview supports a subset of schema DDL, including ordinary tables, primary and unique keys, explicit foreign keys and composite keys. PostgreSQL also accepts supported `ALTER TABLE … ADD` constraints. Unqualified PostgreSQL names use `public`. SQLite uses its `main` schema.

Review keys, optionality and cardinality against the original. Diagrams omit accepted defaults and foreign-key actions. SQLite affinity and differing PostgreSQL types can make an apparently unique foreign key match more than one child, so the importer warns and shows a conservative many-to-one relationship in those cases. You can edit the DBML to reflect facts about your schema that the importer cannot infer.

Unsupported statements stop the import and leave the document untouched. Examples include row data, triggers, indexes, check constraints, implicit foreign-key targets, serial or identity columns, and SQLite table options such as `STRICT`. Use a schema excerpt containing supported DDL. The importer is a diagramming aid and does not validate against a database server.

The [PostgreSQL retail migration](../tools/fixtures/sql-import/postgresql-retail.sql) and [SQLite workspace and notes schema](../tools/fixtures/sql-import/sqlite-notes.sql) each have five tables and five references. They exercise composite keys, quoted identifiers and warnings.
