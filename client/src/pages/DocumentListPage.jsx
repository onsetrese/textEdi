import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  PersonOutlined as PersonOutlineIcon,
  GroupOutlined as GroupOutlinedIcon,
} from "@mui/icons-material";
import { apiFetch } from "../api.js";
import FileUploadButton from "../components/FileUploadButton.jsx";

/** Format an ISO 8601 timestamp for display, tolerating bad input. */
function formatUpdatedAt(updatedAt) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}

/**
 * Renders a single, unified list of all documents (owned + shared) sorted by
 * last-edited date. Ownership is conveyed per-row via the Owner/Shared chip,
 * so no separate sections are needed. Each entry is a clickable ListItemButton
 * that navigates to the editor.
 */
function DocumentList({ docs, onOpen }) {
  if (docs.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
        No documents yet
      </Typography>
    );
  }

  return (
    <List disablePadding>
      {docs.map((doc, index) => (
        <ListItem
          key={doc.id}
          disablePadding
          // Zebra striping: even-indexed rows get a subtle tinted background.
          sx={{
            bgcolor: index % 2 === 0 ? "action.hover" : "transparent",
          }}
          secondaryAction={
            <Chip
              size="small"
              variant={doc.isOwner ? "filled" : "outlined"}
              color={doc.isOwner ? "primary" : "default"}
              icon={doc.isOwner ? <PersonOutlineIcon /> : <GroupOutlinedIcon />}
              // Owned docs show "Owner"; shared docs show the owner's name.
              label={doc.isOwner ? "Owner" : doc.ownerUsername}
            />
          }
        >
          <ListItemButton onClick={() => onOpen(doc.id)}>
            <ListItemText
              primary={doc.title}
              secondary={formatUpdatedAt(doc.updatedAt)}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

export default function DocumentListPage() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/api/documents");
        if (!cancelled) {
          setDocuments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load documents");
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
  }, []);

  // Single list, most-recently-edited first. Invalid/missing dates sort last.
  const sortedDocuments = [...documents].sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime() || 0;
    const tb = new Date(b.updatedAt).getTime() || 0;
    return tb - ta;
  });

  function openDocument(id) {
    navigate(`/documents/${id}`);
  }

  async function createDocument() {
    setError("");
    setCreating(true);
    try {
      const doc = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (doc && doc.id != null) {
        navigate(`/documents/${doc.id}`);
      } else {
        setError("Failed to create document — no document id returned");
      }
    } catch (err) {
      setError(err.message || "Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header area with the "New Document" and file upload actions. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 3,
          gap: 2,
        }}
      >
        <Typography variant="h4" component="h1">
          Documents
        </Typography>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={createDocument}
            disabled={creating}
          >
            New Document
          </Button>
          <FileUploadButton
            onUploaded={openDocument}
            onError={(message) => setError(message)}
          />
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <DocumentList docs={sortedDocuments} onOpen={openDocument} />
      )}
    </Container>
  );
}
