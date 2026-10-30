import {
  FormatBold as FormatBoldIcon,
  FormatItalic as FormatItalicIcon,
  FormatUnderlined as FormatUnderlinedIcon,
  Title as TitleIcon,
  FormatListBulleted as FormatListBulletedIcon,
  FormatListNumbered as FormatListNumberedIcon,
  Notes as NotesIcon,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEditorState } from "@tiptap/react";

/**
 * EditorToolbar — a visible formatting toolbar wired to a TipTap editor.
 *
 * Requirements:
 * - 4.1: bold / italic / underline character formatting.
 * - 4.2: Heading 1, Heading 2, and normal paragraph styles.
 * - 4.3: bulleted (unordered) and numbered (ordered) lists.
 * - 4.4: formatting is applied immediately (TipTap commands mutate the doc in
 *   place; no page reload).
 * - 4.5: controls are exposed via this visible toolbar and TipTap's built-in
 *   keyboard shortcuts remain active (see the caption below).
 *
 * Active-state highlighting stays in sync with the current selection via the
 * `useEditorState` hook, which re-renders this component whenever the editor
 * transaction number changes (selection moves, marks toggle, etc.).
 */
export default function EditorToolbar({ editor }) {
  // Subscribe to the pieces of editor state that drive button highlighting.
  // `useEditorState` re-runs the selector on every transaction and only
  // re-renders when a selected value actually changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            paragraph: e.isActive("paragraph"),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
          }
        : null,
  });

  // Render nothing until the editor instance exists (useEditor returns null on
  // the first render) so the toolbar never dereferences a missing editor.
  if (!editor || !state) {
    return null;
  }

  // The active values feed the MUI ToggleButtonGroup `value` props so the
  // pressed state mirrors the current selection.
  const marks = [];
  if (state.bold) marks.push("bold");
  if (state.italic) marks.push("italic");
  if (state.underline) marks.push("underline");

  let block = null;
  if (state.h1) block = "h1";
  else if (state.h2) block = "h2";
  else if (state.paragraph) block = "paragraph";

  const lists = [];
  if (state.bulletList) lists.push("bulletList");
  if (state.orderedList) lists.push("orderedList");

  return (
    <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
        }}
      >
        {/* Character-level marks (Requirement 4.1). */}
        <ToggleButtonGroup
          size="small"
          value={marks}
          aria-label="text formatting"
        >
          <ToggleButton
            value="bold"
            aria-label="bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Tooltip title="Bold (Ctrl+B)">
              <FormatBoldIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="italic"
            aria-label="italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Tooltip title="Italic (Ctrl+I)">
              <FormatItalicIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="underline"
            aria-label="underline"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Tooltip title="Underline (Ctrl+U)">
              <FormatUnderlinedIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Block styles: headings + paragraph (Requirement 4.2). */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={block}
          aria-label="block style"
        >
          <ToggleButton
            value="h1"
            aria-label="heading 1"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Tooltip title="Heading 1">
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <TitleIcon fontSize="small" />
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 0.25 }}
                >
                  1
                </Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="h2"
            aria-label="heading 2"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Tooltip title="Heading 2">
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <TitleIcon fontSize="small" />
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 0.25 }}
                >
                  2
                </Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="paragraph"
            aria-label="paragraph"
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <Tooltip title="Paragraph">
              <NotesIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* Lists (Requirement 4.3). */}
        <ToggleButtonGroup size="small" value={lists} aria-label="lists">
          <ToggleButton
            value="bulletList"
            aria-label="bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <Tooltip title="Bulleted list">
              <FormatListBulletedIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="orderedList"
            aria-label="ordered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <Tooltip title="Numbered list">
              <FormatListNumberedIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/*
        Keyboard shortcuts (Requirement 4.5): TipTap's StarterKit registers
        Ctrl/Cmd+B (bold) and Ctrl/Cmd+I (italic) out of the box, and the
        Underline extension registers Ctrl/Cmd+U. These are active because the
        corresponding extensions are configured on the editor in EditorPage, so
        no extra wiring is required here.
      */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.5, ml: 0.5 }}
      >
        Shortcuts: Ctrl+B bold, Ctrl+I italic, Ctrl+U underline
      </Typography>
    </Paper>
  );
}
