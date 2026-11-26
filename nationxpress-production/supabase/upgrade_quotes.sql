-- Safe upgrade for a previously installed NationXpress database.
alter table public.quote_leads add column if not exists status text not null default 'New';
alter table public.quote_leads drop constraint if exists quote_leads_status_check;
alter table public.quote_leads add constraint quote_leads_status_check check (status in ('New','Contacted','Quoted','Won','Lost'));
grant select, update on public.quote_leads to authenticated;
drop policy if exists "staff may update quotes" on public.quote_leads;
create policy "staff may update quotes" on public.quote_leads for update to authenticated using ((select public.is_nx_staff())) with check ((select public.is_nx_staff()));