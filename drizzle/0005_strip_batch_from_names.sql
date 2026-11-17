-- Names generated from email addresses before this change kept the batch tag ("Swapneel P Ug25").
-- Strip a trailing batch tag; names people typed themselves never end in one.
UPDATE "user"
SET name = regexp_replace(name, '\s+(ug|pg|phd|tlp|ms|mba|mtech|btech|yif)\d{2,4}$', '', 'i'),
    updated_at = now()
WHERE name ~* '\s(ug|pg|phd|tlp|ms|mba|mtech|btech|yif)\d{2,4}$';
