-- Atomic "record a play": increment play_count and stamp last_played_at in one
-- statement, so concurrent plays can't clobber each other's count (no
-- read-then-write race). Returns the updated row.
create or replace function public.record_play(p_id uuid)
returns public.transcriptions
language sql
as $$
  update public.transcriptions
     set play_count = play_count + 1,
         last_played_at = now()
   where id = p_id
  returning *;
$$;
