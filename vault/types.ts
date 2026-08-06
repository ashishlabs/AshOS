export type VaultStatus = "active" | "archived";

export interface VaultNote {
  id: string;
  /** Immutable once created — it's also the Knowledge Graph node's dedup key, see `VaultManager.enrichGraph`. */
  title: string;
  content: string;
  tags: string[];
  /** IDs of other `VaultNote`s this note references. */
  links: string[];
  status: VaultStatus;
  createdAt: string;
  updatedAt: string;
  /** Set when this note was promoted from an Inbox item via `VaultManager.promoteFromInbox`. */
  sourceInboxId?: string;
}
