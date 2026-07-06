import { useState, useCallback, useMemo } from 'react';
import { ALLOWED_MIME_TYPES, MAX_TICKET_ATTACHMENT_SIZE } from '@/lib/constants';

export interface UseFileUploadOptions {
  maxFiles?: number;
  maxSizePerFile?: number;
  allowedMimeTypes?: string[];
}

export interface UseFileUploadReturn {
  files: File[];
  previewUrls: string[];
  errors: string[];
  isOverLimit: boolean;
  addFiles: (newFiles: FileList | File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  validateFile: (file: File) => string | null;
  totalSize: number;
}

/** A file paired with its synchronous blob preview URL. */
interface FileEntry {
  file: File;
  url: string;
  revoke: () => void;
}

/** Creates a blob URL for a File, returning both the URL and a revoke function. */
function createFilePreview(file: File): FileEntry {
  const url = URL.createObjectURL(file);
  return { file, url, revoke: () => URL.revokeObjectURL(url) };
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    maxFiles = 3,
    maxSizePerFile = MAX_TICKET_ATTACHMENT_SIZE,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
  } = options;

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const files = useMemo(() => entries.map((e) => e.file), [entries]);
  const previewUrls = useMemo(() => entries.map((e) => e.url), [entries]);

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!allowedMimeTypes.includes(file.type)) {
        return `File type "${file.type || 'unknown'}" is not allowed`;
      }
      if (file.size > maxSizePerFile) {
        const sizeMB = maxSizePerFile / (1024 * 1024);
        return `File "${file.name}" exceeds the ${sizeMB} MB limit`;
      }
      return null;
    },
    [allowedMimeTypes, maxSizePerFile],
  );

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const newErrors: string[] = [];
      const newEntries: FileEntry[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          newErrors.push(error);
        } else {
          newEntries.push(createFilePreview(file));
        }
      }

      setErrors(newErrors);

      if (newEntries.length > 0) {
        setEntries((prev) => {
          // Revoke entries that will be trimmed off
          const combined = [...prev, ...newEntries];
          const trimmed = combined.slice(0, maxFiles);
          if (trimmed.length < combined.length) {
            combined.slice(maxFiles).forEach((e) => e.revoke());
          }
          return trimmed;
        });
      }
    },
    [validateFile, maxFiles],
  );

  const removeFile = useCallback((index: number) => {
    setEntries((prev) => {
      const entry = prev[index];
      if (entry) entry.revoke();
      return prev.filter((_, i) => i !== index);
    });
    setErrors([]);
  }, []);

  const clearFiles = useCallback(() => {
    setEntries((prev) => {
      prev.forEach((e) => e.revoke());
      return [];
    });
    setErrors([]);
  }, []);

  const isOverLimit = entries.length >= maxFiles;

  return {
    files,
    previewUrls,
    errors,
    isOverLimit,
    addFiles,
    removeFile,
    clearFiles,
    validateFile,
    totalSize,
  };
}
