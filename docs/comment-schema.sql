BEGIN;
CREATE TABLE IF NOT EXISTS property_comment (
  id SERIAL PRIMARY KEY,
  content varchar(1000) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "propertyId" integer NOT NULL,
  "authorId" integer NOT NULL,
  CONSTRAINT uq_property_comment_author UNIQUE ("propertyId", "authorId"),
  CONSTRAINT fk_property_comment_property FOREIGN KEY ("propertyId") REFERENCES property(id) ON DELETE CASCADE,
  CONSTRAINT fk_property_comment_author FOREIGN KEY ("authorId") REFERENCES public."user"(id) ON DELETE RESTRICT
);
COMMIT;
