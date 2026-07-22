import AsyncStorage from '@react-native-async-storage/async-storage';

// Session-scoped persistence for the active user and active wordbook.
// Kept separate from the Repository keys so swapping to an HttpRepo (server
// phase) does not disturb local session selection.

const K_ACTIVE_USER = 'wb_session_active_user';
const K_ACTIVE_WB = 'wb_session_active_wordbook';

export async function loadActiveUser(): Promise<string | null> {
  return (await AsyncStorage.getItem(K_ACTIVE_USER)) ?? null;
}
export async function saveActiveUser(id: string): Promise<void> {
  await AsyncStorage.setItem(K_ACTIVE_USER, id);
}
export async function loadActiveWordbook(): Promise<string | null> {
  return (await AsyncStorage.getItem(K_ACTIVE_WB)) ?? null;
}
export async function saveActiveWordbook(id: string): Promise<void> {
  await AsyncStorage.setItem(K_ACTIVE_WB, id);
}
