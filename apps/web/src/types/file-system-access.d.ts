// TypeScript의 기본 DOM lib(node_modules/typescript/lib/lib.dom.d.ts)에는
// FileSystemDirectoryHandle/FileSystemFileHandle 인터페이스 "정의"는 있지만
// showDirectoryPicker()와 디렉토리 순회(entries/values/keys), 권한 재확인
// (query/requestPermission) 부분은 아직 안 들어가 있어서 여기서 보강한다.

export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;
    values(): AsyncIterableIterator<
      FileSystemFileHandle | FileSystemDirectoryHandle
    >;
    keys(): AsyncIterableIterator<string>;
    [Symbol.asyncIterator](): AsyncIterableIterator<
      [string, FileSystemFileHandle | FileSystemDirectoryHandle]
    >;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?:
      | FileSystemHandle
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos";
  }

  interface Window {
    showDirectoryPicker(
      options?: DirectoryPickerOptions,
    ): Promise<FileSystemDirectoryHandle>;
  }
}
