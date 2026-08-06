export type LearningResourceType = "course" | "book" | "video" | "article";
export type LearningResourceStatus = "to-learn" | "in-progress" | "completed";

export interface LearningResource {
  id: string;
  /** Immutable once created — it's also the Knowledge Graph node's dedup key, see `LearningManager.enrichResourceGraph`. */
  title: string;
  type: LearningResourceType;
  url?: string;
  notes: string;
  status: LearningResourceStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags: string[];
  /** Days until the next review. */
  interval: number;
  /** SuperMemo-2 "E-Factor" — starts at 2.5, floors at 1.3. See `srs.ts`. */
  easeFactor: number;
  /** Consecutive successful reviews. Resets to 0 on a failed ("again") review. */
  repetitions: number;
  /** ISO timestamp — the card is due for review once this is in the past. */
  dueDate: string;
  reviewCount: number;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
