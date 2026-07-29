import { useSession } from '@/components/SessionProvider';
import { getDailyProgress, type DailyProgress } from '@/lib/dailyProgress';
import { repo } from '@/lib/data';
import { getDailySettings } from '@/lib/data/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

export function useDailyProgress(): DailyProgress | null {
  const { user, wordbook } = useSession();
  const [progress, setProgress] = useState<DailyProgress | null>(null);

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
    }, [user, wordbook]),
  );
  return progress;
}
