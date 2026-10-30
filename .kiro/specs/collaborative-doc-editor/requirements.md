# Requirements Document

## Introduction

A lightweight collaborative document editor inspired by Google Docs. The application allows users to create, edit, and share rich-text documents through a web interface. It supports real-time or session-based collaboration, file uploads for importing existing content, persistent storage, and a clear ownership/sharing model. The goal is a strong, working solution prioritized within a 4–6 hour build timebox.

## Tech Stack

- **Frontend**: React (Vite), Material UI (MUI)
- **Backend**: Node.js (Express)
- **Database**: SQLite via `better-sqlite3` (file-based, zero-config, no external server required)
- **Rich-Text Editor**: TipTap (React-based, headless, MUI-compatible)

## Glossary

- **Document**: A named, persistent rich-text artifact created and edited by a User.
- **Owner**: The User who created a Document and holds full administrative rights over it.
- **Collaborator**: A User who has been granted access to a Document by the Owner.
- **Editor**: The rich-text editing component (TipTap) that renders and modifies Document content.
- **Session**: An authenticated or mocked-authenticated context that identifies the current User.
- **Import**: The process of converting an uploaded file into an editable Document.
- **User**: An authenticated or mocked-authenticated actor of the system.
- **Storage**: The SQLite database persisted as a local `.db` file managed by `better-sqlite3`.
- **Share_Grant**: The mechanism through which an Owner grants another User access to a Document.

---

## Requirements

### Requirement 1: User Authentication (Lightweight / Mocked)

**User Story:** As a visitor, I want to identify myself with a username or simple login, so that the system can associate documents with me and support sharing.

#### Acceptance Criteria

1. THE Editor_App SHALL provide a login screen that accepts a username (and optionally a password) to establish a Session.
2. WHEN valid credentials are available in the system, THE Editor_App SHALL create or resume a Session and redirect the User to the document list regardless of whether the credentials were just submitted.
3. WHILE a Session is active, THE Editor_App SHALL display the current User's identity in the UI.
4. IF a User attempts to access a protected route without an active Session, THEN THE Editor_App SHALL redirect the User to the login screen.
5. THE Editor_App SHALL support at least two distinct User identities to demonstrate sharing behavior.

---

### Requirement 2: Document Creation

**User Story:** As an authenticated User, I want to create new documents, so that I can start writing and organizing content.

#### Acceptance Criteria

1. WHEN an authenticated User requests a new document, THE Editor_App SHALL create a Document with a default title and an empty body, and navigate the User to the Editor.
2. WHEN a User edits the document title field, THE Editor_App SHALL update the Document title on save or on blur.
3. THE Editor_App SHALL persist every new Document to Storage before the User navigates away; IF the Storage operation fails, THEN THE Editor_App SHALL block navigation AND display an error message to the User; both blocking navigation and displaying the error message are required together and neither may be omitted.
   3a. THE Editor_App SHALL also automatically persist Document content to Storage at regular intervals (at minimum every 30 seconds) while the User is actively editing.
4. THE Editor_App SHALL assign the creating User as the Owner of the Document.

---

### Requirement 3: Document Listing and Navigation

**User Story:** As an authenticated User, I want to see all documents I own or have access to, so that I can quickly find and open them.

#### Acceptance Criteria

1. THE Editor_App SHALL display a document list page showing all Documents the current User owns or has been granted access to; IF the User is not authenticated, THEN THE Editor_App SHALL redirect the User to the login screen before displaying the document list.
2. THE Editor_App SHALL visually distinguish Owned documents from Shared documents in the list (e.g., label, icon, or section grouping).
3. WHEN an authenticated User selects a Document from the list, THE Editor_App SHALL navigate to the Editor and load the Document's content; THE Editor_App SHALL prevent unauthenticated Users from selecting or accessing any Document.
4. THE Editor_App SHALL display the Document title, Owner username, and last-modified timestamp in the document list.

---

### Requirement 4: Rich-Text Editing

**User Story:** As a User with access to a document, I want to apply rich-text formatting, so that I can structure and emphasize content effectively.

#### Acceptance Criteria

1. THE Editor SHALL support bold, italic, and underline character-level formatting applied to selected text.
2. THE Editor SHALL support heading styles (at minimum Heading 1, Heading 2, and normal paragraph text).
3. THE Editor SHALL support bulleted (unordered) lists and numbered (ordered) lists.
4. WHEN a User applies a formatting action, THE Editor SHALL reflect the formatting change immediately without a full page reload; IF the formatting reflection fails for technical reasons (e.g., rendering error), THEN THE Editor SHALL display an error message or provide a retry mechanism to the User.
5. THE Editor SHALL expose formatting controls via a visible toolbar and SHALL also support keyboard shortcuts for formatting actions so that formatting remains accessible regardless of toolbar visibility.

---

### Requirement 5: Document Saving and Reopening

**User Story:** As a User, I want my document content and formatting to persist, so that I can close and reopen a document without losing work.

#### Acceptance Criteria

1. THE Editor_App SHALL save Document content and formatting structure to Storage atomically when the User explicitly triggers a save action (e.g., button or keyboard shortcut); IF the save cannot persist both content and formatting together, THEN THE Editor_App SHALL treat the entire save operation as failed and apply the failure behavior defined in criterion 4.
2. WHERE auto-save is implemented, THE Editor_App SHALL automatically save Document content to Storage within 5 seconds of the last keystroke.
3. WHEN a User reopens a Document, THE Editor_App SHALL restore the full content and formatting exactly as last saved.
4. IF a save operation fails and the failure is not automatically retried successfully, THEN THE Editor_App SHALL display an error message to the User AND retain the unsaved content in the Editor; both the error message and content retention are required.

---

### Requirement 6: File Upload and Import

**User Story:** As a User, I want to upload a file and convert it into an editable document, so that I can work with existing content inside the editor.

#### Acceptance Criteria

1. THE Editor_App SHALL accept file uploads in at least one of the following formats: `.txt`, `.md`.
2. WHEN a User uploads a supported file, THE Editor_App SHALL create a new Document pre-populated with the file's text content and navigate the User to the Editor.
3. IF a User uploads a file type that is not supported, THEN THE Editor_App SHALL display a clear error message listing the supported file types AND SHALL NOT create a Document or navigate the User to the Editor.
4. THE Editor_App SHALL display the list of supported file types in the upload UI before the User selects a file.
5. IF an uploaded file exceeds 10 MB, THEN THE Editor_App SHALL reject the file and display an error message stating the size limit.

---

### Requirement 7: Document Sharing

**User Story:** As a Document Owner, I want to grant another User access to my document, so that they can view or edit it.

#### Acceptance Criteria

1. WHEN a Document Owner opens a Document, THE Editor_App SHALL provide a sharing control that allows the Owner to enter another User's username and grant access.
2. WHEN an Owner submits a valid username for sharing, THE Editor_App SHALL add that User as a Collaborator on the Document and confirm the action to the Owner.
3. IF an Owner submits a username that does not exist in the system, THEN THE Editor_App SHALL display an error message indicating the User was not found.
4. WHEN a Collaborator accesses a shared Document, THE Editor_App SHALL allow the Collaborator to view and edit the Document content.
5. THE Editor_App SHALL prevent any User who is not the Owner of the specific Document from accessing the sharing control or modifying that Document's share settings.
6. THE Editor_App SHALL display the list of current Collaborators on a Document exclusively to the Owner of that Document.

---

### Requirement 8: Persistence and Data Integrity

**User Story:** As a User, I want my documents and sharing settings to survive a page refresh or server restart, so that my work is not lost.

#### Acceptance Criteria

1. THE Storage SHALL persist Document content, formatting, metadata (title, owner, timestamps), and sharing grants across application restarts, and THE Storage layer SHALL guarantee data integrity so that no committed data is silently lost or corrupted.
2. WHEN a User refreshes the browser, THE Editor_App SHALL restore the document list and document content from Storage without data loss; IF any part of the restoration fails, THEN THE Editor_App SHALL treat the entire restoration as failed and display an error state to the User rather than showing partially recovered data.
3. WHEN a Collaborator is granted access and the page is refreshed, THE Editor_App SHALL continue to show the shared Document in the Collaborator's document list.
4. THE Storage layer SHALL be SQLite managed via `better-sqlite3`, persisted as a local `.db` file in the project root.

---

### Requirement 9: Validation and Error Handling

**User Story:** As a User, I want clear feedback when something goes wrong, so that I understand what happened and how to proceed.

#### Acceptance Criteria

1. IF a User submits a form with a required field empty, THEN THE Editor_App SHALL display a validation message identifying the missing field.
2. IF a network or Storage error occurs during a save, load, or share operation and the error is not automatically retried successfully, THEN THE Editor_App SHALL display a human-readable error message and not silently discard the error.
3. THE Editor_App SHALL handle unexpected server errors by displaying a generic error message rather than an unhandled exception or raw stack trace; THE Editor_App SHALL NOT display a generic server error message when no server error has occurred.

---

### Requirement 10: Setup, Deployment, and Documentation

**User Story:** As a developer or evaluator, I want clear setup instructions and an architecture note, so that I can run and understand the application quickly.

#### Acceptance Criteria

1. THE Repository SHALL include a README with step-by-step instructions to install dependencies, configure environment variables, and start the application locally.
2. THE README SHALL specify all supported file upload types.
3. THE Repository SHALL include a short architecture note (in the README or a separate file) describing the major components, technology choices, and data model.
4. THE Editor_App SHALL include at least one automated backend unit test written with Jest that exercises a meaningful server-side behavior (e.g., document creation, save/load round-trip, or sharing grant); frontend testing is explicitly out of scope.
5. THE README SHALL include the deployment URL and any credentials needed to access the running application; once any deployment has been provided, this information SHALL remain in the README even if the deployment is temporarily unavailable.
