import { useState, useEffect } from "react";
import { api, FileNode } from "../api/client";

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
    width: "200px",
    borderRight: "1px solid #1e1e30",
    overflow: "auto",
    padding: "0.5rem 0",
    flexShrink: 0,
  },
  treeItem: {
    padding: "0.2rem 0.5rem",
    cursor: "pointer",
    fontSize: "0.8rem",
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
    padding: "0.4rem 0.75rem",
    borderBottom: "1px solid #1e1e30",
    fontSize: "0.8rem",
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
  textarea: {
    flex: 1,
    width: "100%",
    background: "transparent",
    color: "#e0e0e0",
    border: "none",
    outline: "none",
    padding: "0.75rem",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.8rem",
    resize: "none" as const,
    lineHeight: 1.5,
    tabSize: 2,
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
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const paddingLeft = `${0.5 + depth * 0.75}rem`;

  if (node.type === "directory") {
    return (
      <>
        <div
          style={{ ...styles.treeItem, ...styles.treeDir, paddingLeft }}
          onClick={() => setOpen(!open)}
        >
          {open ? "\u25BE " : "\u25B8 "}{node.name}/
        </div>
        {open && node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  return (
    <div
      style={{
        ...styles.treeItem,
        paddingLeft,
        ...(selectedPath === node.path ? styles.treeItemActive : {}),
      }}
      onClick={() => onSelect(node.path)}
    >
      {node.name}
    </div>
  );
}

export default function FileViewer({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getFileTree(projectId).then(setTree);
  }, [projectId]);

  const openFile = async (filePath: string) => {
    try {
      const file = await api.getFile(projectId, filePath);
      setSelectedFile(filePath);
      setContent(file.content);
      setOriginalContent(file.content);
    } catch {
      // binary or unreadable file
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.updateFile(projectId, selectedFile, content);
      setOriginalContent(content);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  return (
    <div style={styles.container}>
      <div style={styles.tree}>
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedFile}
            onSelect={openFile}
          />
        ))}
      </div>
      <div style={styles.editor}>
        {selectedFile ? (
          <>
            <div style={styles.editorHeader}>
              <span>{selectedFile}</span>
              {hasChanges && (
                <button style={styles.saveBtn} onClick={saveFile} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
            <textarea
              style={styles.textarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl+S to save
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault();
                  if (hasChanges) saveFile();
                }
                // Tab key inserts spaces
                if (e.key === "Tab") {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  setContent(content.substring(0, start) + "  " + content.substring(end));
                  setTimeout(() => {
                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                  }, 0);
                }
              }}
              spellCheck={false}
            />
          </>
        ) : (
          <div style={styles.empty}>Select a file to view</div>
        )}
      </div>
    </div>
  );
}
