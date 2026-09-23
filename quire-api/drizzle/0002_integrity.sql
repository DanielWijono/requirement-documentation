-- Comment threads are one level deep, and a reply lives on the same page as its parent.
CREATE FUNCTION comments_check_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent record;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT page_id, parent_id INTO parent FROM comments WHERE id = NEW.parent_id;
  IF parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'replies cannot have replies' USING ERRCODE = 'check_violation', CONSTRAINT = 'comments_reply_depth';
  END IF;
  IF parent.page_id <> NEW.page_id THEN
    RAISE EXCEPTION 'a reply must be on the same page as its comment' USING ERRCODE = 'check_violation', CONSTRAINT = 'comments_reply_page';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER comments_check_parent BEFORE INSERT OR UPDATE OF parent_id, page_id ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_check_parent();
--> statement-breakpoint
-- A page's parent is in the same space, and a page never ends up below itself.
CREATE FUNCTION pages_check_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF (SELECT space_id FROM pages WHERE id = NEW.parent_id) <> NEW.space_id THEN
    RAISE EXCEPTION 'a page and its parent must be in the same space' USING ERRCODE = 'check_violation', CONSTRAINT = 'pages_parent_space';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM pages WHERE id = NEW.parent_id
      UNION
      SELECT p.id, p.parent_id FROM pages p JOIN ancestors a ON p.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'a page cannot move below itself' USING ERRCODE = 'check_violation', CONSTRAINT = 'pages_no_cycle';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pages_check_parent BEFORE INSERT OR UPDATE OF parent_id, space_id ON pages
  FOR EACH ROW EXECUTE FUNCTION pages_check_parent();
