import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Container,
  Link,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { Save as SaveIcon, Share as ShareIcon } from "@mui/icons-material";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import EditorToolbar from "../components/EditorToolbar.jsx";
import ShareDialog from "../components/ShareDialog.jsx";
import { apiFetch } from "../api.js";

/**
 * EditorPage — hosts the TipTap editor for a single document.
 *
 * Responsibilities implemented so far:
 * - 11.1: Fetches `GET /api/documents/:id` on mount and loads its HTML into
 *   TipTap; renders an editable title field that persists via
 *   `PUT /api/documents/:id` on blur or Enter.
 * - 11.2: a formatting toolbar wired to the `editor` instance.
 * - 11.3: explicit save (Save button + Ctrl/Cmd+S) and background auto-save
 *   (debounced within 5s of the last keystroke and on a 30s interval) using the
 *   editor HTML. Explicit saves confirm via a Snackbar; auto-saves are silent
 *   on success. On failure the error is shown and editor content is retained.
 *
 * Later tasks build on the state exposed here:
 * - 12.1 adds a Share button/dialog gated on `isOwner`.
 */
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Document metadata kept in state so downstream tasks can build on it.
  const [title, setTitle] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [ownerUsername, setOwnerUsername] = useState("");

  // Share dialog visibility (task 12.1). The control that opens it is only
  // rendered for the owner (Requirements 7.5, 7.6).
  const [shareOpen, setShareOpen] = useState(false);

  // Save state (task 11.3). `saving` disables the button + shows progress;
  // `saveSuccess` drives a transient confirmation Snackbar for explicit saves;
  // `lastSavedAt` powers a subtle "Saved <time>" status line.
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // The last title we persisted, used to avoid redundant PUTs on blur/enter.
  const savedTitleRef = useRef("");

  // Dirty tracking (task 11.3): auto-save only fires a request when the editor
  // content has changed since the last successful save, avoiding needless PUTs.
  const dirtyRef = useRef(false);
  // Debounce handle for the "within 5s of last keystroke" auto-save.
  const debounceRef = useRef(null);

  // Initialise TipTap. Content is loaded after the fetch resolves (see effect
  // below) so the editor can mount immediately in a non-editable-until-loaded
  // state without waiting on the network.
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: "",
    editable: false,
  });

  // Fetch the document on mount (and whenever the id changes).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const doc = await apiFetch(`/api/documents/${id}`);
        if (cancelled || !doc) {
          return;
        }
        setTitle(doc.title ?? "");
        savedTitleRef.current = doc.title ?? "";
        setIsOwner(Boolean(doc.isOwner));
        setOwnerUsername(doc.ownerUsername ?? "");

        // Push the HTML into TipTap once the editor instance is ready.
        if (editor) {
          // `emitUpdate: false` so loading the initial content doesn't mark the
          // document dirty and trigger a spurious auto-save.
          editor.commands.setContent(doc.content || "", { emitUpdate: false });
          editor.setEditable(true);
          dirtyRef.current = false;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load document");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // `editor` is intentionally included: `useEditor` may return null on the
    // first render, so we re-run once the instance becomes available.
  }, [id, editor]);

  // Persist the title via PUT. Skips the request when the value is unchanged.
  const saveTitle = useCallback(async () => {
    const trimmed = title.trim();
    const next = trimmed === "" ? "Untitled Document" : title;

    // Normalise an empty title back to a sensible default in the UI.
    if (trimmed === "" && title !== next) {
      setTitle(next);
    }

    if (next === savedTitleRef.current) {
      return;
    }

    try {
      await apiFetch(`/api/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: next }),
      });
      savedTitleRef.current = next;
    } catch (err) {
      setError(err.message || "Failed to save title");
    }
  }, [id, title]);

  function handleTitleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  // Persist the current TipTap HTML (and title, so it stays in sync) via PUT.
  //
  // `silent` distinguishes explicit saves (Save button / Ctrl+S), which surface
  // a success confirmation, from auto-saves, which succeed quietly but still
  // surface errors. On failure we keep the editor content untouched — TipTap
  // already retains it — satisfying Requirement 5.4 (error + content retention).
  const saveDocument = useCallback(
    async (silent = false) => {
      if (!editor) {
        return;
      }

      const trimmed = title.trim();
      const nextTitle = trimmed === "" ? "Untitled Document" : title;
      const content = editor.getHTML();

      setSaving(true);
      try {
        await apiFetch(`/api/documents/${id}`, {
          method: "PUT",
          body: JSON.stringify({ title: nextTitle, content }),
        });
        // A successful content save also persists the title, so keep the
        // title-on-blur logic in sync and clear the dirty flag.
        savedTitleRef.current = nextTitle;
        dirtyRef.current = false;
        setLastSavedAt(new Date());
        setError("");
        if (!silent) {
          setSaveSuccess(true);
        }
      } catch (err) {
        // Retain unsaved content (do not reset the editor) and show the error.
        setError(err.message || "Failed to save document");
      } finally {
        setSaving(false);
      }
    },
    [id, title, editor],
  );

  // Keep a ref to the latest save handler so timers and the keydown listener
  // always invoke the current closure (fresh title/editor) instead of a stale
  // one captured when the effect first ran.
  const saveRef = useRef(saveDocument);
  useEffect(() => {
    saveRef.current = saveDocument;
  }, [saveDocument]);

  // Explicit save via Ctrl/Cmd+S (Requirement 5.1). Registered once; delegates
  // to the ref so it never captures a stale save handler.
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-save wiring (Requirements 2.3, 5.2). Only starts once the document has
  // loaded and the editor exists.
  useEffect(() => {
    if (loading || !editor) {
      return undefined;
    }

    // Debounced auto-save: on every content change, mark the document dirty and
    // (re)arm a 3s timer (< 5s per Req 5.2) that saves silently.
    function handleUpdate() {
      dirtyRef.current = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        if (dirtyRef.current) {
          saveRef.current(true);
        }
      }, 3000);
    }

    editor.on("update", handleUpdate);

    // Interval auto-save: every 30s (Req 2.3), save silently if dirty.
    const intervalId = setInterval(() => {
      if (dirtyRef.current) {
        saveRef.current(true);
      }
    }, 30000);

    return () => {
      editor.off("update", handleUpdate);
      clearInterval(intervalId);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [loading, editor]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Breadcrumb navigation on the left, ownership context on the right. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
        }}
      >
        <Breadcrumbs>
          <Link
            component="button"
            type="button"
            underline="hover"
            color="inherit"
            onClick={() => navigate("/documents")}
          >
            Documents
          </Link>
          <Typography color="text.primary" noWrap sx={{ maxWidth: 360 }}>
            {title || "Untitled Document"}
          </Typography>
        </Breadcrumbs>

        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ flexShrink: 0 }}
        >
          Owner: {ownerUsername || "—"}
          {isOwner ? " (you)" : ""}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {/* Header: editable title + (task 12.1) share button/dialog. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
        }}
      >
        <TextField
          variant="standard"
          fullWidth
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled Document"
          slotProps={{
            input: { style: { fontSize: "2rem", fontWeight: 500 } },
          }}
        />

        {/* Share control (task 12.1) — rendered only for the owner so
            non-owners never see the sharing control (Requirements 7.5, 7.6). */}
        {isOwner && (
          <Button
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={() => setShareOpen(true)}
            sx={{ flexShrink: 0 }}
          >
            Share
          </Button>
        )}
      </Box>

      {/* toolbar (task 11.2) — formatting buttons wired to the editor */}
      <EditorToolbar editor={editor} />

      {/* Save controls (task 11.3): explicit Save button + last-saved status.
          Auto-save runs silently in the background (see effects above). */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 2,
          mb: 2,
        }}
      >
        {lastSavedAt && (
          <Typography variant="caption" color="text.secondary">
            Saved {lastSavedAt.toLocaleTimeString()}
          </Typography>
        )}
        <Button
          variant="contained"
          startIcon={
            saving ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
          onClick={() => saveDocument()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </Box>

      {/* Editor content area — bordered, padded, document-like surface. */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          minHeight: 480,
          "& .ProseMirror": {
            minHeight: 440,
            outline: "none",
          },
        }}
      >
        <EditorContent editor={editor} />
      </Paper>

      {/* Transient confirmation for explicit saves (Requirement 5.1). */}
      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSaveSuccess(false)}
          sx={{ width: "100%" }}
        >
          Document saved
        </Alert>
      </Snackbar>

      {/* Share dialog (task 12.1) — owner-only. Gated on `isOwner` so the
          collaborator list is never mounted for non-owners (Req 7.6). */}
      {isOwner && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          documentId={id}
        />
      )}
    </Container>
  );
}
