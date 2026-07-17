-- Aggarwal Jewellers — 0056: scrub the old "AggarwalDIVA" brand from STORED AI content.
-- The listing prompt was retuned long ago, but content generated during the deploy blockage
-- (e.g. BD1000's page title "Mahika Necklace | AggarwalDIVA | …" and "by AggarwalDIVA" in the
-- description) is data, not code — this one-time pass rewrites it in place. IDEMPOTENT: the
-- WHERE clause matches nothing once clean; the double-brand dedupe keeps titles tidy.

update public.products
set generated_content = replace(
      regexp_replace(generated_content::text, 'AggarwalDIVA', 'Aggarwal Jewellers', 'gi'),
      'Aggarwal Jewellers | Aggarwal Jewellers', 'Aggarwal Jewellers'
    )::jsonb
where generated_content is not null
  and generated_content::text ilike '%aggarwaldiva%';

-- Same scrub for any cached variant/media captions that may carry the old brand (best-effort;
-- skipped automatically if the table/column doesn't exist in this build).
do $$ begin
  update public.image_generations
  set prompt = regexp_replace(prompt, 'AggarwalDIVA', 'Aggarwal Jewellers', 'gi')
  where prompt ilike '%aggarwaldiva%';
exception when undefined_table or undefined_column then null; end $$;
