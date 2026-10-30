import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { apiFetch } from "../api.js";

/**
 * ShareDialog — owner-only dialog for granting another user access to a
 * document and viewing the current collaborator list.
 *
 * Behaviour (task 12.1, Requirements 7.1, 7.2, 7.3, 7.6):
 * - When opened, fetches `GET /api/documents/:id/shares` and renders the
 *   current collaborators (or "No collaborators yet" when empty).
 * - On submit, validates the username is non-empty (Req 9.1), then calls
 *   `POST /api/documents/:id/shares` with `{ username }`.
 *   - On success: shows a success Alert, clears the input, and refreshes the
 *     collaborator list from the POST response (the endpoint returns the
 *     updated `ShareEntry[]`).
 *   - On error (e.g. 404 "User not found"): shows an error Alert with the
 *     server-provided message.
 *
 * This component is only rendered by the owner — `EditorPage` gates it behind
 * `isOwner === true` (Requirements 7.5, 7.6), so non-owners never mount it.
 *
 * @param {boolean} props.open - Whether the dialog is visible.
 * @param {() => void} props.onClose - Called when the dialog requests to close.
 * @param {number|string} props.documentId - The document being shared.
 */
export default function ShareDialog({ open, onClose, documentId }) {
  const [username, setUsername] = useState("");
  const [collaborators, setCollaborators] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load the current collaborator list. Reused on open and after a share.
  const loadCollaborators = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const list = await apiFetch(`/api/documents/${documentId}/shares`);
      setCollaborators(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || "Failed to load collaborators");
    } finally {
      setLoadingList(false);
    }
  }, [documentId]);

  // On open: reset transient state and (re)fetch the collaborator list.
  useEffect(() => {
    if (!open) {
      return;
    }
    setUsername("");
    setValidationError("");
    setError("");
    setSuccess("");
    loadCollaborators();
  }, [open, loadCollaborators]);

  async function handleShare(event) {
    event.preventDefault();

    const trimmed = username.trim();
    if (trimmed === "") {
      setValidationError("Username is required");
      return;
    }
    setValidationError("");
    setError("");
    setSuccess("");

    setSubmitting(true);
    try {
      const updated = await apiFetch(`/api/documents/${documentId}/shares`, {
        method: "POST",
        body: JSON.stringify({ username: trimmed }),
      });
      setSuccess(`Shared with ${trimmed}`);
      setUsername("");
      // The POST returns the updated collaborator list; fall back to a
      // re-fetch if the server returned something unexpected.
      if (Array.isArray(updated)) {
        setCollaborators(updated);
      } else {
        await loadCollaborators();
      }
    } catch (err) {
      setError(err.message || "Failed to share document");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Share document</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleShare} sx={{ mt: 1 }}>
          <TextField
            label="Username"
            fullWidth
            autoFocus
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (validationError) {
                setValidationError("");
              }
            }}
            error={Boolean(validationError)}
            helperText={validationError || " "}
            disabled={submitting}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              startIcon={
                submitting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : null
              }
            >
              {submitting ? "Sharing…" : "Share"}
            </Button>
          </Box>
        </Box>

        {success && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            onClose={() => setSuccess("")}
          >
            {success}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Divider sx={{ my: 1 }} />

        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Collaborators
        </Typography>
        {loadingList ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : collaborators.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No collaborators yet
          </Typography>
        ) : (
          <List dense>
            {collaborators.map((collaborator) => (
              <ListItem key={collaborator.userId} disableGutters>
                <ListItemText primary={collaborator.username} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
