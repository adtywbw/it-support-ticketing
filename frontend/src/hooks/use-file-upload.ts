import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    maxFiles = 3,
    maxSizePerFile = MAX_TICKET_ATTACHMENT_SIZE,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
  } = options;

  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const urlsToRevoke = useRef<string[]>([]);

  useEffect(() => {
    urlsToRevoke.current.forEach((url) => URL.revokeObjectURL(url));
    const newUrls = files.map((file) => URL.createObjectURL(file));
    urlsToRevoke.current = newUrls;
  }, [files]);

  useEffect(() => {
    return () => {
      urlsToRevoke.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const previewUrls = useMemo(
    () => files.map((_, i) => urlsToRevoke.current[i] ?? ''),
    [files],
  );

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
      const validFiles: File[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          newErrors.push(error);
        } else {
          validFiles.push(file);
        }
      }

      setErrors(newErrors);

      if (validFiles.length > 0) {
        setFiles((prev) => {
          const combined = [...prev, ...validFiles];
          return combined.slice(0, maxFiles);
        });
      }
    },
    [validateFile, maxFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setErrors([]);
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setErrors([]);
  }, []);

  const isOverLimit = files.length >= maxFiles;

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
