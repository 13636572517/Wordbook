import { useSession } from '@/components/SessionProvider';
import { getDailyProgress, type DailyProgress } from '@/lib/dailyProgress';
import { repo } from '@/lib/data';
import { getDailySettings } from '@/lib/data/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

export interface DailyProgressState {
  progress: DailyProgress | null;
  refresh: () => void;
}

export function useDailyProgress(): DailyProgressState {
  const { user, wordbook } = useSession();
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (!user || !wordbook) {
        setProgress(null);
        return;
      }
      let active = true;
      (async () => {
        try {
          const settings = await getDailySettings(user.id);
          const next = await getDailyProgress(repo, user.id, wordbook.id, Date.now(), settings);
          if (active) setProgress(next);
        } catch {
          if (active) setProgress(null);
        }
      })();
      return () => { active = false; };
    }, [user, wordbook, refreshVersion]),
  );
  return { progress, refresh };
}
