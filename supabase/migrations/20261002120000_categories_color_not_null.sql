-- categories.color has always defaulted to '#6B7280' and the app never writes
-- NULL; make the contract explicit so generated types say `string`.
UPDATE public.categories SET color = '#6B7280' WHERE color IS NULL;
ALTER TABLE public.categories ALTER COLUMN color SET NOT NULL;
