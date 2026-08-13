import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createEditor, type RhwpEditor } from "@rhwp/editor";

interface HwpEditorProps {
  className?: string;
}

export interface HwpEditorHandle {
  loadFile: (data: Uint8Array, fileName?: string) => Promise<void>;
}

export const HwpEditor = forwardRef<HwpEditorHandle, HwpEditorProps>(function HwpEditor(
  { className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RhwpEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    createEditor(containerRef.current).then((editor) => {
      if (cancelled) {
        editor.destroy();
        return;
      }
      editorRef.current = editor;
    });

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    loadFile: async (data, fileName) => {
      if (!editorRef.current) throw new Error("에디터가 아직 준비되지 않았습니다.");
      await editorRef.current.loadFile(data, fileName);
    },
  }));

  return <div ref={containerRef} className={className} />;
});
