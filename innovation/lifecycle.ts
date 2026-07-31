import type { IdeaLifecycleStage, Opportunity } from "./types";

/**
 * The idea lifecycle state machine from the design doc: every opportunity
 * accumulates knowledge as it moves captured -> validated -> growing ->
 * researching -> planning -> building -> testing -> released, with
 * archived/revived as an escape hatch from (almost) any stage. Kept as pure
 * functions over `Opportunity` rather than a class — mirrors
 * `evolution/evaluation/evaluator.ts`'s "pure, dependency-free logic" style
 * so transition rules are trivial to unit test.
 */
export const LIFECYCLE_TRANSITIONS: Record<IdeaLifecycleStage, IdeaLifecycleStage[]> = {
  captured: ["validated", "archived"],
  validated: ["growing", "researching", "archived"],
  growing: ["researching", "planning", "archived"],
  researching: ["planning", "archived"],
  planning: ["building", "archived"],
  building: ["testing", "archived"],
  testing: ["released", "building", "archived"],
  released: ["archived"],
  archived: ["revived"],
  revived: ["validated", "archived"]
};

export function canTransition(from: IdeaLifecycleStage, to: IdeaLifecycleStage): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function nextStages(from: IdeaLifecycleStage): IdeaLifecycleStage[] {
  return LIFECYCLE_TRANSITIONS[from];
}

/** Returns a new Opportunity with its stage advanced, or throws if the transition isn't allowed from the current stage. */
export function transition(opportunity: Opportunity, to: IdeaLifecycleStage): Opportunity {
  if (!canTransition(opportunity.stage, to)) {
    throw new Error(`invalid idea lifecycle transition: ${opportunity.stage} -> ${to}`);
  }
  const now = new Date().toISOString();
  return {
    ...opportunity,
    stage: to,
    updatedAt: now,
    history: [...opportunity.history, { at: now, event: `stage: ${opportunity.stage} -> ${to}` }]
  };
}
