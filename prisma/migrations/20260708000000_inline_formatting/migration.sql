-- Inline formatting: Block.content now stores a JSON-encoded Span[]
-- (see lib/block-content.ts). The BlockType enum grew two list-item values.
-- Neither change requires DDL on Block itself:
--   • the `content` column is already TEXT — Prisma stores JSON strings in it
--   • the `type` column is TEXT with no CHECK constraint, so new enum values
--     just start being valid.
--
-- What DOES need updating: the FTS5 block-content triggers, which used to
-- copy `NEW.content` verbatim into the search index. Now content is JSON and
-- FTS needs the concatenated plain text of all Spans. We use SQLite's JSON1
-- extension (`json_each` + `json_extract`), guarded by `json_valid` so a
-- transient bad row can't error out the trigger.

DROP TRIGGER IF EXISTS "SearchIndex_block_ai";
DROP TRIGGER IF EXISTS "SearchIndex_block_au";

CREATE TRIGGER "SearchIndex_block_ai" AFTER INSERT ON "Block" BEGIN
    INSERT INTO "SearchIndex"("kind", "pageId", "blockId", "title", "text")
    SELECT
      'block',
      NEW."pageId",
      NEW."id",
      (SELECT "title" FROM "Page" WHERE "id" = NEW."pageId"),
      iif(
        NEW."content" IS NOT NULL AND json_valid(NEW."content"),
        (SELECT COALESCE(GROUP_CONCAT(json_extract(value, '$.text'), ''), '')
           FROM json_each(NEW."content")),
        ''
      );
END;

CREATE TRIGGER "SearchIndex_block_au" AFTER UPDATE OF "content" ON "Block" BEGIN
    UPDATE "SearchIndex"
       SET "text" = iif(
             NEW."content" IS NOT NULL AND json_valid(NEW."content"),
             (SELECT COALESCE(GROUP_CONCAT(json_extract(value, '$.text'), ''), '')
                FROM json_each(NEW."content")),
             ''
           )
     WHERE "kind" = 'block' AND "blockId" = NEW."id";
END;
