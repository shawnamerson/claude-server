import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { api, FileNode } from "../api/client";
import { useToast } from "./Toast";

const langMap: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  json: "json", html: "html", css: "css", md: "markdown",
  py: "python", sh: "shell", yml: "yaml", yaml: "yaml",
  sql: "sql", dockerfile: "dockerfile",
};

function getLanguage(path: string): string {
  const name = path.split("/").pop() || "";
  if (name === "Dockerfile" || name === "dockerfile") return "dockerfile";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return langMap[ext] || "plaintext";
}

const styles = {
  container: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    background: "#0a0a0f",
  },
  tree: {
    width: "180px",
    borderRight: "1px solid #1e1e30",
    overflow: "auto",
    padding: "0.5rem 0",
    flexShrink: 0,
  },
  treeItem: {
    padding: "0.2rem 0.5rem",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#aaa",
  },
  treeItemActive: {
    background: "#1a1a2e",
    color: "#e0e0e0",
  },
  treeDir: {
    color: "#60a5fa",
  },
  editor: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    overflow: "hidden",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.3rem 0.75rem",
    borderBottom: "1px solid #1e1e30",
    fontSize: "0.78rem",
    color: "#888",
    flexShrink: 0,
  },
  saveBtn: {
    padding: "0.2rem 0.6rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#555",
    fontSize: "0.85rem",
  },
};

function TreeNode({
  node, depth, selectedPath, onSelect,
}: {
  node: FileNode; depth: number; selectedPath: string | null; onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const paddingLeft = `${0.5 + depth * 0.75}rem`;

  if (node.type === "directory") {
    return (
      <>
        <div style={{ ...styles.treeItem, ...styles.treeDir, paddingLeft }} onClick={() => setOpen(!open)}>
          {open ? "\u25BE " : "\u25B8 "}{node.name}/
        </div>
        {open && node.children?.map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </>
    );
  }

  return (
    <div
      style={{ ...styles.treeItem, paddingLeft, ...(selectedPath === node.path ? styles.treeItemActive : {}) }}
      onClick={() => onSelect(node.path)}
    >
      {node.name}
    </div>
  );
}

export default function FileViewer({ projectId, onFilesUploaded }: { projectId: string; onFilesUploaded?: (filenames: string[]) => void }) {
  const { showError } = useToast();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    api.getFileTree(projectId).then(setTree);
  }, [projectId]);

  const openFile = async (filePath: string) => {
    try {
      const file = await api.getFile(projectId, filePath);
      setSelectedFile(filePath);
      setContent(file.content);
      setOriginalContent(file.content);
    } catch {}
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.updateFile(projectId, selectedFile, content);
      setOriginalContent(content);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadedNames: string[] = [];
      for (const file of Array.from(files)) {
        await api.uploadFile(projectId, file, "public");
        uploadedNames.push(file.name);
      }
      api.getFileTree(projectId).then(setTree);
      if (onFilesUploaded && uploadedNames.length > 0) {
        onFilesUploaded(uploadedNames);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const hasChanges = content !== originalContent;

  return (
    <div style={styles.container}>
      <div style={styles.tree}>
        {tree.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} selectedPath={selectedFile} onSelect={openFile} />
        ))}
        <label style={{
          display: "block", padding: "0.4rem 0.5rem", margin: "0.5rem 0.3rem 0",
          background: "#7c3aed", color: "#fff", borderRadius: "0.35rem",
          fontSize: "0.75rem", textAlign: "center" as const, cursor: "pointer",
        }}>
          {uploading ? "Uploading..." : "Upload Files"}
          <input type="file" multiple accept="image/*,.svg,.ico,.pdf,.json,.csv,.txt"
            onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
        </label>
      </div>
      <div style={styles.editor}>
        {selectedFile ? (
          <>
            <div style={styles.editorHeader}>
              <span>{selectedFile}</span>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {hasChanges && <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>Modified</span>}
                <button style={{ ...styles.saveBtn, opacity: hasChanges ? 1 : 0.4 }} onClick={saveFile} disabled={saving || !hasChanges}>
                  {saving ? "Saving..." : "Save (Ctrl+S)"}
                </button>
              </div>
            </div>
            <Editor
              height="100%"
              language={getLanguage(selectedFile)}
              value={content}
              onChange={(val) => setContent(val || "")}
              onMount={(editor) => {
                editorRef.current = editor;
                // Ctrl+S to save
                editor.addCommand(2048 + 49, () => { // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
                  if (hasChanges) saveFile();
                });
              }}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                automaticLayout: true,
                padding: { top: 8 },
              }}
            />
          </>
        ) : (
          <div style={styles.empty}>Select a file to edit</div>
        )}
      </div>
    </div>
  );
}
