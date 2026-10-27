/* Area tutor: gruppi e dati degli studenti. Le regole di accesso (RLS) garantiscono che un tutor
   veda solo chi si è unito ai suoi gruppi. */
import { sb, state } from './session.js';

const check = ({ data, error }) => { if (error) throw error; return data; };

export async function listGroups() {
  return check(await sb.from('groups').select('id, name, code, created_at')
    .eq('owner_id', state.user.id).order('created_at'));
}

export async function createGroup(name) {
  return check(await sb.from('groups').insert({ name: name.trim() }).select('id, name, code, created_at').single());
}

export async function renameGroup(id, name) {
  check(await sb.from('groups').update({ name: name.trim() }).eq('id', id));
}

export async function deleteGroup(id) {
  check(await sb.from('groups').delete().eq('id', id));
}

export async function removeMember(groupId, userId) {
  check(await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}

export async function groupData(groupId) {
  const members = check(await sb.from('group_members').select('user_id, joined_at, profiles(display_name)').eq('group_id', groupId))
    .map((m) => ({ user_id: m.user_id, joined_at: m.joined_at, name: m.profiles?.display_name || 'Giocatore' }));
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return { members, progress: [], attempts: [] };
  const [progress, attempts] = await Promise.all([
    sb.from('progress').select('user_id, data, updated_at').in('user_id', ids).then(check),
    sb.from('attempts').select('user_id, kind, item, win, stars, errors, deaths, wrongs, played_at')
      .in('user_id', ids).order('played_at', { ascending: false }).limit(2000).then(check),
  ]);
  return { members, progress, attempts };
}
