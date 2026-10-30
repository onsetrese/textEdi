import { useRef } from "react";
import { Box, Button, Typography } from "@mui/material";
import { UploadFile as UploadFileIcon } from "@mui/icons-material";
import { apiFetch } from "../api.js";

/** Client-side upload constraints — kept in sync with the backend import route. */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SUPPORTED_EXTENSIONS = [".txt", ".md"];

/** Returns the lowercased extension (including the dot) of a filename. */
function getExtension(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) {
    return "";
  }
  return filename.slice(dot).toLowerCase();
}

/**
 * A button that opens a file picker restricted to `.txt` / `.md`, validates the
 * selected file client-side (type + size), and uploads it via
 * `POST /api/documents/import`.
 *
 * On a successful import it invokes `onUploaded(id)` so the parent can navigate
 * to the new document. Validation and request errors are surfaced through
 * `onError(message)`.
 *
 * @param {(id: number) => void} props.onUploaded - Called with the new doc id.
 * @param {(message: string) => void} props.onError - Called with an error message.
 */
export default function FileUploadButton({ onUploaded, onError }) {
  const inputRef = useRef(null);

  function openPicker() {
    inputRef.current?.click();
  }

  async function handleChange(event) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers change.
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!SUPPORTED_EXTENSIONS.includes(getExtension(file.name))) {
      onError?.("Unsupported file type. Supported types: .txt, .md");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      onError?.("File exceeds the 10 MB size limit");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const doc = await apiFetch("/api/documents/import", {
        method: "POST",
        body: formData,
      });
      if (doc && doc.id != null) {
        onUploaded?.(doc.id);
      } else {
        onError?.("Import failed — the server did not return a document");
      }
    } catch (err) {
      onError?.(err.message || "Failed to import file");
    }
  }

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
    >
      <Button
        variant="outlined"
        startIcon={<UploadFileIcon />}
        onClick={openPicker}
      >
        Upload File
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        Supported: .txt, .md (max 10 MB)
      </Typography>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md"
        hidden
        onChange={handleChange}
      />
    </Box>
  );
}
