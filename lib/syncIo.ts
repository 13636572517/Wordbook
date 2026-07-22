import { Platform, Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  serializeSnapshot,
  parseSnapshot,
  ProgressSnapshot,
  SyncError,
} from './sync';

// Native export/import uses a fixed file in the app's document directory.
// NOTE: the File is created lazily (inside the native branch) because on Web
// `Paths.document` is not a valid Directory object and constructing it at
// module load time would throw `this.validatePath is not a function`.
function getNativeFile(): File {
  return new File(Paths.document, 'progress.json');
}

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
    const f = getNativeFile();
    await f.write(json);
    Alert.alert('已导出', `进度已保存到 ${f.uri ?? 'document 目录'}`);
  }
}

export async function importProgress(): Promise<ProgressSnapshot> {
  let json: string;
  if (Platform.OS === 'web') {
    json = await pickFileWeb();
  } else {
    try {
      json = await getNativeFile().text();
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
