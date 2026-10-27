-- Editor dei casi clinici: ruoli della redazione, bozze dei casi e dei capitoli, cronologia delle versioni.
-- Da eseguire una volta nel progetto Supabase (SQL Editor, oppure `supabase db push`), dopo 20261027190000_account_e_tutor.sql.
--
-- Chi vede cosa (Row Level Security):
--   * chi non fa parte della redazione (tabella editors) non vede né bozze né versioni;
--   * autori e amministratori leggono tutte le bozze e tutte le versioni;
--   * l'autore crea bozze e modifica le proprie finché sono in stato 'bozza', poi le invia in revisione con submit_draft();
--   * solo l'amministratore modifica qualsiasi bozza, la approva o la rimanda all'autore con una nota (review_draft()),
--     la elimina e gestisce la redazione (add_editor, remove_editor, list_editors);
--   * le versioni sono in sola aggiunta: nessuno le modifica, spariscono solo insieme alla loro bozza.
--
-- Ciclo di una bozza: bozza → in-revisione → approvato (oppure di nuovo bozza, con la nota dell'amministratore)
-- → pubblicato quando l'amministratore la porta nei contenuti del gioco.

-- ---------------------------------------------------------------- tabelle

-- se un membro elimina l'account esce anche dalla redazione (on delete cascade): il diritto alla cancellazione
-- vale anche per l'ultimo amministratore, che in quel caso va rinominato con la riga in fondo al file
create table public.editors (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'autore')),
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null
);

create table public.case_drafts (
  id uuid primary key default gen_random_uuid(),
  case_id integer check (case_id > 0),       -- caso pubblicato che la bozza modifica; null per un caso nuovo
  chapter text check (char_length(chapter) between 1 and 40),   -- capitolo di destinazione (es. 'c1')
  title text not null check (char_length(title) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 500000),
  status text not null default 'bozza' check (status in ('bozza', 'in-revisione', 'approvato', 'pubblicato')),
  -- set null: se l'autore elimina l'account il lavoro fatto resta alla redazione
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  review_note text check (char_length(review_note) <= 2000)
);
create index case_drafts_status on public.case_drafts (status, updated_at desc);
create index case_drafts_author on public.case_drafts (author_id);

-- proposte di modifica ai capitoli (titolo, area, elenco dei casi...): stesso schema e stesso ciclo delle bozze dei casi
create table public.chapter_drafts (
  id uuid primary key default gen_random_uuid(),
  chapter text not null check (char_length(chapter) between 1 and 40),   -- capitolo modificato o proposto (es. 'c2')
  title text not null check (char_length(title) between 1 and 120),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 500000),
  status text not null default 'bozza' check (status in ('bozza', 'in-revisione', 'approvato', 'pubblicato')),
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  review_note text check (char_length(review_note) <= 2000)
);
create index chapter_drafts_status on public.chapter_drafts (status, updated_at desc);
create index chapter_drafts_author on public.chapter_drafts (author_id);

create table public.case_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.case_drafts (id) on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500)
);
create index case_versions_draft on public.case_versions (draft_id, saved_at desc);

create table public.chapter_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.chapter_drafts (id) on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500)
);
create index chapter_versions_draft on public.chapter_versions (draft_id, saved_at desc);

-- ---------------------------------------------------------------- funzioni di supporto
-- security definer: leggono editors senza passare dalle sue policy, così le policy delle bozze possono usarle

create function public.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.editors e where e.user_id = auth.uid());
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.editors e where e.user_id = auth.uid() and e.role = 'admin');
$$;

-- data e autore dell'ultima modifica li scrive il database, non il client
create function public.touch_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- una versione nuova ogni volta che il contenuto cambia (anche alla creazione della bozza)
create function public.version_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return null;
  end if;
  if tg_table_name = 'case_drafts' then
    insert into public.case_versions (draft_id, data, saved_by) values (new.id, new.data, auth.uid());
  else
    insert into public.chapter_versions (draft_id, data, saved_by) values (new.id, new.data, auth.uid());
  end if;
  return null;
end;
$$;

create trigger case_drafts_touch before insert or update on public.case_drafts
  for each row execute function public.touch_draft();
create trigger chapter_drafts_touch before insert or update on public.chapter_drafts
  for each row execute function public.touch_draft();
create trigger case_drafts_version after insert or update of data on public.case_drafts
  for each row execute function public.version_draft();
create trigger chapter_drafts_version after insert or update of data on public.chapter_drafts
  for each row execute function public.version_draft();

-- ---------------------------------------------------------------- bozze: invio, revisione, versioni con nota
-- funzionano sia con le bozze dei casi sia con quelle dei capitoli: l'id basta a trovarle

-- l'autore invia la propria bozza in revisione (anche l'amministratore può farlo per chiunque)
create function public.submit_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_status text;
  v_case boolean := true;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_editor() then
    raise exception 'Riservato alla redazione' using errcode = '42501';
  end if;
  select d.author_id, d.status into v_author, v_status from public.case_drafts d where d.id = p_id for update;
  if not found then
    v_case := false;
    select d.author_id, d.status into v_author, v_status from public.chapter_drafts d where d.id = p_id for update;
    if not found then
      raise exception 'Bozza non trovata' using errcode = 'P0002';
    end if;
  end if;
  if v_author is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Puoi inviare solo le tue bozze' using errcode = '42501';
  end if;
  if v_status <> 'bozza' then
    raise exception 'Solo una bozza può essere inviata in revisione';
  end if;
  if v_case then
    update public.case_drafts set status = 'in-revisione' where id = p_id;
  else
    update public.chapter_drafts set status = 'in-revisione' where id = p_id;
  end if;
end;
$$;

-- l'amministratore approva la bozza in revisione o la rimanda all'autore: per rimandarla serve una nota
create function public.review_draft(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_case boolean := true;
  v_note text := nullif(trim(p_note), '');
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_admin() then
    raise exception 'Riservato agli amministratori' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Scegli se approvare o rimandare';
  end if;
  if not p_approve and v_note is null then
    raise exception 'Per rimandare una bozza serve una nota';
  end if;
  select d.status into v_status from public.case_drafts d where d.id = p_id for update;
  if not found then
    v_case := false;
    select d.status into v_status from public.chapter_drafts d where d.id = p_id for update;
    if not found then
      raise exception 'Bozza non trovata' using errcode = 'P0002';
    end if;
  end if;
  if v_status <> 'in-revisione' then
    raise exception 'La bozza non è in revisione';
  end if;
  if v_case then
    update public.case_drafts
    set status = case when p_approve then 'approvato' else 'bozza' end, review_note = left(v_note, 2000)
    where id = p_id;
  else
    update public.chapter_drafts
    set status = case when p_approve then 'approvato' else 'bozza' end, review_note = left(v_note, 2000)
    where id = p_id;
  end if;
end;
$$;

-- fotografa il contenuto attuale con una nota ("prima stesura", "corrette le dosi"...); restituisce l'id della versione
create function public.save_version(p_draft_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_data jsonb;
  v_id uuid;
  v_case boolean := true;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_editor() then
    raise exception 'Riservato alla redazione' using errcode = '42501';
  end if;
  select d.author_id, d.data into v_author, v_data from public.case_drafts d where d.id = p_draft_id;
  if not found then
    v_case := false;
    select d.author_id, d.data into v_author, v_data from public.chapter_drafts d where d.id = p_draft_id;
    if not found then
      raise exception 'Bozza non trovata' using errcode = 'P0002';
    end if;
  end if;
  if v_author is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Puoi salvare versioni solo delle tue bozze' using errcode = '42501';
  end if;
  if v_case then
    insert into public.case_versions (draft_id, data, saved_by, note)
    values (p_draft_id, v_data, auth.uid(), left(nullif(trim(p_note), ''), 500)) returning id into v_id;
  else
    insert into public.chapter_versions (draft_id, data, saved_by, note)
    values (p_draft_id, v_data, auth.uid(), left(nullif(trim(p_note), ''), 500)) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- redazione (solo amministratori)

-- aggiunge un utente registrato alla redazione, o ne cambia il ruolo. L'email serve solo a trovarlo:
-- non viene restituita né salvata fuori da auth.users
create function public.add_editor(p_email text, p_role text)
returns table (user_id uuid, display_name text, role text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_admin() then
    raise exception 'Riservato agli amministratori' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'autore') then
    raise exception 'Ruolo non valido' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null or not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'Utente non trovato' using errcode = 'P0002';
  end if;
  -- blocca le righe degli amministratori: due cambi di ruolo contemporanei non possono lasciare la redazione senza admin
  perform 1 from public.editors e where e.role = 'admin' for update;
  if p_role = 'autore'
     and exists (select 1 from public.editors e where e.user_id = v_user and e.role = 'admin')
     and (select count(*) from public.editors e where e.role = 'admin') <= 1 then
    raise exception 'Serve almeno un amministratore';
  end if;
  insert into public.editors as e (user_id, role, added_by) values (v_user, p_role, auth.uid())
  on conflict on constraint editors_pkey do update set role = excluded.role;
  return query
    select e.user_id, p.display_name, e.role
    from public.editors e join public.profiles p on p.id = e.user_id
    where e.user_id = v_user;
end;
$$;

-- toglie un utente dalla redazione (le sue bozze restano); l'ultimo amministratore non può essere rimosso
create function public.remove_editor(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_admin() then
    raise exception 'Riservato agli amministratori' using errcode = '42501';
  end if;
  perform 1 from public.editors e where e.role = 'admin' for update;
  select e.role into v_role from public.editors e where e.user_id = p_user for update;
  if v_role is null then
    raise exception 'Non fa parte della redazione' using errcode = 'P0002';
  end if;
  if v_role = 'admin' and (select count(*) from public.editors e where e.role = 'admin') <= 1 then
    raise exception 'Serve almeno un amministratore';
  end if;
  delete from public.editors e where e.user_id = p_user;
end;
$$;

-- elenco della redazione con il nome da giocatore e il ruolo, mai l'email
create function public.list_editors()
returns table (user_id uuid, display_name text, role text, added_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  if not public.is_admin() then
    raise exception 'Riservato agli amministratori' using errcode = '42501';
  end if;
  return query
    select e.user_id, p.display_name, e.role, e.added_at
    from public.editors e join public.profiles p on p.id = e.user_id
    order by e.role = 'admin' desc, p.display_name;
end;
$$;

revoke execute on function public.is_editor(), public.is_admin(),
  public.submit_draft(uuid), public.review_draft(uuid, boolean, text), public.save_version(uuid, text),
  public.add_editor(text, text), public.remove_editor(uuid), public.list_editors() from public, anon;
grant execute on function public.is_editor(), public.is_admin(),
  public.submit_draft(uuid), public.review_draft(uuid, boolean, text), public.save_version(uuid, text),
  public.add_editor(text, text), public.remove_editor(uuid), public.list_editors() to authenticated;
revoke execute on function public.touch_draft(), public.version_draft() from public, anon, authenticated;

-- ---------------------------------------------------------------- regole di accesso

alter table public.editors enable row level security;
alter table public.case_drafts enable row level security;
alter table public.chapter_drafts enable row level security;
alter table public.case_versions enable row level security;
alter table public.chapter_versions enable row level security;

-- permessi minimi: chi non ha fatto login non accede a nulla; la redazione si gestisce solo con le funzioni qui sopra;
-- autore, date e revisione delle bozze li scrive il database (default, trigger e review_draft), non il client
revoke all on public.editors, public.case_drafts, public.chapter_drafts, public.case_versions, public.chapter_versions
  from anon, authenticated;
grant select on public.editors, public.case_drafts, public.chapter_drafts, public.case_versions, public.chapter_versions
  to authenticated;
grant insert (case_id, chapter, title, data, status), update (case_id, chapter, title, data, status), delete
  on public.case_drafts to authenticated;
grant insert (chapter, title, data, status), update (chapter, title, data, status), delete
  on public.chapter_drafts to authenticated;
-- nessun permesso di scrittura sulle versioni: le creano il trigger e save_version()

create policy "redazione: vedo il mio ruolo, l'amministratore vede tutti" on public.editors
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "bozze casi: la redazione legge tutto" on public.case_drafts
  for select to authenticated using ((select public.is_editor()));
create policy "bozze casi: l'autore ne crea, l'amministratore anche già avanzate" on public.case_drafts
  for insert to authenticated with check (
    (select public.is_admin())
    or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'));
create policy "bozze casi: l'autore modifica le sue finché sono bozze, l'amministratore tutto" on public.case_drafts
  for update to authenticated
  using ((select public.is_admin()) or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'))
  with check ((select public.is_admin()) or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'));
create policy "bozze casi: solo l'amministratore elimina" on public.case_drafts
  for delete to authenticated using ((select public.is_admin()));

create policy "bozze capitoli: la redazione legge tutto" on public.chapter_drafts
  for select to authenticated using ((select public.is_editor()));
create policy "bozze capitoli: l'autore ne crea, l'amministratore anche già avanzate" on public.chapter_drafts
  for insert to authenticated with check (
    (select public.is_admin())
    or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'));
create policy "bozze capitoli: l'autore modifica le sue finché sono bozze, l'amministratore tutto" on public.chapter_drafts
  for update to authenticated
  using ((select public.is_admin()) or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'))
  with check ((select public.is_admin()) or ((select public.is_editor()) and author_id = (select auth.uid()) and status = 'bozza'));
create policy "bozze capitoli: solo l'amministratore elimina" on public.chapter_drafts
  for delete to authenticated using ((select public.is_admin()));

create policy "versioni casi: la redazione legge tutto" on public.case_versions
  for select to authenticated using ((select public.is_editor()));
create policy "versioni capitoli: la redazione legge tutto" on public.chapter_versions
  for select to authenticated using ((select public.is_editor()));

-- ---------------------------------------------------------------- primo amministratore
-- La redazione si gestisce solo da amministratore, quindi il primo va nominato a mano, una volta sola.
-- Registrati nel gioco, conferma l'email, poi nel SQL Editor esegui la riga qui sotto togliendo "-- "
-- e mettendo la tua email al posto di quella di esempio (deve risultare "1 row affected"):
--
-- insert into public.editors (user_id, role) select id, 'admin' from auth.users where lower(email) = lower('tua.email@esempio.it') on conflict (user_id) do update set role = 'admin';
