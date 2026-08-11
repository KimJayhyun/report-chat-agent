import { useEffect, useRef } from "react";
import { createEditor, type RhwpEditor } from "@rhwp/editor";

interface HwpEditorProps {
  className?: string;
}

export function HwpEditor({ className }: HwpEditorProps) {
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

  return <div ref={containerRef} className={className} />;
}
