/**
 * Repository Ingestion Engine.
 *
 * Handles directory upload, recursive path preservation, filtering of ignored/binary/oversized
 * files, path normalization, and import statistics collection.
 */

export interface SampleFile {
  path: string;
  content: string;
}

export interface IngestionConfig {
  readonly maxFileSizeBytes: number;
  readonly maxTotalBytes: number;
  readonly maxFileCount: number;
  readonly ignoreDirs: readonly string[];
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  maxFileSizeBytes: 1024 * 1024, // 1 MB
  maxTotalBytes: 30 * 1024 * 1024, // 30 MB
  maxFileCount: 1000,
  ignoreDirs: [
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    '.venv',
    'venv',
    '__pycache__',
    'coverage',
    'target',
    '.idea',
    '.vscode',
    'bin',
    'obj',
  ],
};

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.jar',
  '.war',
  '.class',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.pyc',
  '.pyo',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.wav',
  '.ogg',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.wasm',
]);

/**
 * Normalizes a relative path: converts backslashes, strips leading root folder if present,
 * and eliminates path traversal attempts (`..`).
 */
export function normalizeRelativePath(rawPath: string, stripRoot = false): string {
  // Normalize slashes
  let clean = rawPath.replace(/\\/g, '/');

  // Strip leading slash
  if (clean.startsWith('/')) {
    clean = clean.slice(1);
  }

  // Resolve directory traversal elements using stack
  const rawSegments = clean.split('/');
  const stack: string[] = [];
  for (const seg of rawSegments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      stack.pop();
    } else {
      stack.push(seg);
    }
  }

  if (stripRoot && stack.length > 1) {
    return stack.slice(1).join('/');
  }

  return stack.join('/');
}

/**
 * Check whether a file path should be ingested or skipped.
 */
export function checkIngestibility(
  rawPath: string,
  sizeBytes: number,
  config: IngestionConfig = DEFAULT_INGESTION_CONFIG,
  stripRoot = true,
): { accept: boolean; reason?: string; normalizedPath: string } {
  const normalized = normalizeRelativePath(rawPath, stripRoot);

  if (!normalized) {
    return { accept: false, reason: 'Empty or invalid path', normalizedPath: '' };
  }

  // Check ignored directories anywhere in path
  const parts = normalized.split('/');
  for (const dir of config.ignoreDirs) {
    if (parts.includes(dir)) {
      return { accept: false, reason: `Ignored directory "${dir}"`, normalizedPath: normalized };
    }
  }

  // Check file extension for binary types
  const lower = normalized.toLowerCase();
  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return { accept: false, reason: `Binary file format (${ext})`, normalizedPath: normalized };
    }
  }

  // Check file size limit
  if (sizeBytes > config.maxFileSizeBytes) {
    const sizeKb = Math.round(sizeBytes / 1024);
    return { accept: false, reason: `File size exceeds 1MB limit (${sizeKb}KB)`, normalizedPath: normalized };
  }

  // Check 0-byte empty files
  if (sizeBytes === 0) {
    return { accept: false, reason: 'Empty file (0 bytes)', normalizedPath: normalized };
  }

  return { accept: true, normalizedPath: normalized };
}

export interface IngestionProgressEvent {
  stage: 'scanning' | 'reading' | 'done';
  processed: number;
  total: number;
  currentFile?: string;
}

export interface IngestionResult {
  repoName: string;
  files: SampleFile[];
  totalOriginalFiles: number;
  totalBytes: number;
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Reads a FileList or array of Files, preserving directory hierarchy from webkitRelativePath.
 */
export async function ingestFileList(
  fileList: FileList | readonly File[],
  onProgress?: (event: IngestionProgressEvent) => void,
  config: IngestionConfig = DEFAULT_INGESTION_CONFIG,
): Promise<IngestionResult> {
  const total = fileList.length;
  const files: SampleFile[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  let totalBytes = 0;

  // Infer repo name from first file's webkitRelativePath if available
  let repoName = 'custom-repo';
  if (fileList.length > 0) {
    const first = fileList[0];
    if (first && first.webkitRelativePath) {
      const topDir = first.webkitRelativePath.split('/')[0];
      if (topDir) repoName = topDir;
    }
  }

  onProgress?.({ stage: 'scanning', processed: 0, total });

  for (let i = 0; i < total; i++) {
    const file = fileList[i]!;
    const rawPath = file.webkitRelativePath || file.name;

    const check = checkIngestibility(rawPath, file.size, config);
    if (!check.accept) {
      skipped.push({ path: rawPath, reason: check.reason ?? 'Skipped' });
      continue;
    }

    if (files.length >= config.maxFileCount) {
      skipped.push({ path: rawPath, reason: `Reached maximum repository file limit (${config.maxFileCount})` });
      continue;
    }

    if (totalBytes + file.size > config.maxTotalBytes) {
      skipped.push({ path: rawPath, reason: `Total repository size exceeded (${Math.round(config.maxTotalBytes / (1024 * 1024))}MB)` });
      continue;
    }

    onProgress?.({ stage: 'reading', processed: i + 1, total, currentFile: check.normalizedPath });

    try {
      const content = await readFileContent(file);
      files.push({
        path: check.normalizedPath,
        content,
      });
      totalBytes += file.size;
    } catch (err: any) {
      skipped.push({ path: rawPath, reason: `Read failure: ${err?.message || 'Unknown read error'}` });
    }
  }

  onProgress?.({ stage: 'done', processed: total, total });

  return {
    repoName,
    files,
    totalOriginalFiles: total,
    totalBytes,
    skipped,
  };
}

function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
