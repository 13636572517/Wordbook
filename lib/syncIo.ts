import { Platform, Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  serializeSnapshot,
  parseSnapshot,
  ProgressSnapshot,
  SyncError,
} from './sync';

// Native export/import uses a fixed file in the app's document directory.
const NATIVE_FILE = new File(Paths.document, 'progress.json');

export async function exportProgress(snapshot: ProgressSnapshot): Promise<void> {
  const json = serializeSnapshot(snapshot);
  if (Platform.OS === 'web') {
    const g = globalThis as any;
    const blob = new g.Blob([json], { type: 'application/json' });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = `vocab-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    g.URL.revokeObjectURL(url);
  } else {
    await NATIVE_FILE.write(json);
    Alert.alert('已导出', `进度已保存到 ${NATIVE_FILE.uri ?? 'document 目录'}`);
  }
}

export async function importProgress(): Promise<ProgressSnapshot> {
  let json: string;
  if (Platform.OS === 'web') {
    json = await pickFileWeb();
  } else {
    try {
      json = await NATIVE_FILE.text();
    } catch {
      throw new SyncError('未找到导入文件，请先导出一次');
    }
  }
  return parseSnapshot(json); // throws SyncError on invalid input
}

function pickFileWeb(): Promise<string> {
  const g = globalThis as any;
  return new Promise<string>((resolve, reject) => {
    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new SyncError('未选择文件'));
        return;
      }
      resolve(await file.text());
    };
    input.click();
  });
}
