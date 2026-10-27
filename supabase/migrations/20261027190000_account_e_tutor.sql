-- Account giocatori e area tutor.
-- Da eseguire una volta nel progetto Supabase (SQL Editor, oppure `supabase db push`).
--
-- Chi vede cosa (Row Level Security):
--   * ogni giocatore legge e scrive solo il proprio profilo, i propri progressi e le proprie partite;
--   * chi crea un gruppo ne è il tutor: vede nome, progressi e partite di chi si è unito al gruppo con il codice;
--   * l'email non è mai visibile ad altri utenti: resta in auth.users.

-- ---------------------------------------------------------------- tabelle

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key,                       -- generato dal client: un reinvio dopo un errore di rete non duplica la partita
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('case', 'event')),
  item text not null,                        -- id del caso (es. '3') o dell'evento (es. 'e1')
  win boolean not null,
  stars smallint not null check (stars between 0 and 3),
  errors smallint not null check (errors >= 0),
  deaths smallint not null check (deaths >= 0),
  wrongs jsonb not null default '[]'::jsonb, -- risposte sbagliate: [{step, tag, opt, text, x}]
  played_at timestamptz not null default now()
);
create index attempts_user_played on public.attempts (user_id, played_at desc);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);
create index groups_owner on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

-- ---------------------------------------------------------------- funzioni di supporto
-- security definer: leggono groups/group_members senza passare dalle loro policy (evita la ricorsione tra le due tabelle)

create function public.owns_group(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = gid and g.owner_id = auth.uid());
$$;

create function public.in_group(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid());
$$;

create function public.is_tutor_of(student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.user_id = student and g.owner_id = auth.uid()
  );
$$;

-- profilo creato in automatico alla registrazione, con il nome scelto nel modulo
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Giocatore'), 40));
  insert into public.progress (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- unirsi a un gruppo con il codice del tutor (i gruppi non sono elencabili: serve il codice esatto)
create function public.join_group(p_code text) returns table (id uuid, name text)
language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
  gname text;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  select g.id, g.name into gid, gname from public.groups g where g.code = upper(trim(p_code));
  if gid is null then
    raise exception 'Codice non valido' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return query select gid, gname;
end;
$$;

-- nome del gruppo e del tutor per chi ne fa parte
create function public.my_groups() returns table (id uuid, name text, tutor text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, p.display_name, m.joined_at
  from public.group_members m
  join public.groups g on g.id = m.group_id
  join public.profiles p on p.id = g.owner_id
  where m.user_id = auth.uid()
  order by m.joined_at;
$$;

-- diritto alla cancellazione: elimina l'account e, a cascata, tutti i dati collegati
create function public.delete_own_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.owns_group(uuid), public.in_group(uuid), public.is_tutor_of(uuid),
  public.join_group(text), public.my_groups(), public.delete_own_account() from public, anon;
grant execute on function public.owns_group(uuid), public.in_group(uuid), public.is_tutor_of(uuid),
  public.join_group(text), public.my_groups(), public.delete_own_account() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- regole di accesso

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.attempts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- permessi minimi: chi non ha fatto login non accede a nulla, gli altri solo a ciò che serve al gioco
revoke all on public.profiles, public.progress, public.attempts, public.groups, public.group_members from anon, authenticated;
grant select on public.profiles, public.progress, public.attempts, public.groups, public.group_members to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (user_id, data, updated_at), update (data, updated_at) on public.progress to authenticated;
grant insert (id, kind, item, win, stars, errors, deaths, wrongs, played_at) on public.attempts to authenticated;
grant insert (name), update (name), delete on public.groups to authenticated;
grant delete on public.group_members to authenticated;

create policy "profilo: leggo il mio e quello dei miei studenti" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_tutor_of(id));
create policy "profilo: modifico il mio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "progressi: leggo i miei e quelli dei miei studenti" on public.progress
  for select to authenticated using (user_id = (select auth.uid()) or public.is_tutor_of(user_id));
create policy "progressi: creo i miei" on public.progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progressi: aggiorno i miei" on public.progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "partite: leggo le mie e quelle dei miei studenti" on public.attempts
  for select to authenticated using (user_id = (select auth.uid()) or public.is_tutor_of(user_id));
create policy "partite: registro le mie" on public.attempts
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "gruppi: vedo quelli che gestisco o di cui faccio parte" on public.groups
  for select to authenticated using (owner_id = (select auth.uid()) or public.in_group(id));
create policy "gruppi: ne creo come tutor" on public.groups
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "gruppi: rinomino i miei" on public.groups
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "gruppi: elimino i miei" on public.groups
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "membri: vedo la mia iscrizione e i membri dei miei gruppi" on public.group_members
  for select to authenticated using (user_id = (select auth.uid()) or public.owns_group(group_id));
create policy "membri: esco da un gruppo, il tutor può rimuovere" on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()) or public.owns_group(group_id));
-- nessuna policy di insert: ci si unisce solo con join_group()
