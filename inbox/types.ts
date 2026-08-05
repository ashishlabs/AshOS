/**
 * Universal Inbox: the single capture point everything else in the
 * "Second Brain" vision (Knowledge Vault, Idea Lab, Project Workspaces)
 * feeds from — see `docs/second-brain-roadmap.md` and `docs/inbox.md`.
 * Voice/image/screenshot capture are out of scope for this stage (same
 * media-pipeline gap tracked in `docs/roadmap.md`); text and URLs cover
 * the bulk of real capture volume.
 */
export type InboxSourceType =
  | "text"
  | "note"
  | "url"
  | "article"
  | "github-repo"
  | "youtube"
  | "tweet"
  | "pdf";

export type InboxStatus = "unread" | "reviewed" | "archived";

export interface InboxItem {
  id: string;
  content: string;
  sourceType: InboxSourceType;
  status: InboxStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  detectedUrl?: string;
}

export interface InboxClassification {
  sourceType: InboxSourceType;
  tags: string[];
  detectedUrl?: string;
}
