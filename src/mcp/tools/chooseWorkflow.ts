import { parseChooseWorkflowInput } from "../types.ts";

/**
 * One recommended MCP tool with the reason it fits the situation.
 */
type WorkflowToolRecommendation = {
  /** MCP tool name to call. */
  name: string;
  /** Why this tool fits the current need. */
  reason: string;
};

/**
 * Structured chooser response returned by the `choose_workflow` tool.
 */
type WorkflowChoiceResult = {
  /** Echoed user goal. */
  goal: string;
  /** Optional echoed lifecycle context. */
  currentStep?: string;
  /** High-level chooser route. */
  route: string;
  /** Short explanation of the routing decision. */
  why: string;
  /** Ordered tool recommendations for the current situation. */
  recommendedTools: WorkflowToolRecommendation[];
  /** Concrete next action to take first. */
  nextStep: string;
  /** Current lifecycle position inferred by the chooser. */
  lifecyclePosition: string;
  /** Canonical nine-step lifecycle reference. */
  lifecycleGuide: string[];
  /** Lower-priority alternatives that also fit. */
  alternatives: WorkflowToolRecommendation[];
  /** Additional operating notes for the caller. */
  notes: string[];
};

const lifecycleGuide = [
  "1. Open or update the work-item that owns the current slice.",
  "2. Read bounded context for the topic, rationale, and dependencies that matter.",
  "3. Perform the implementation, investigation, or migration work in the relevant repository.",
  "4. Record session-level progress in a session-note.",
  "5. Record a verification-result when a meaningful check completes; if the slice changed code, do this before done and describe the checks that actually ran.",
  "6. If stable policy or architecture changes, create or update a decision.",
  "7. If long-lived guidance changes, update the relevant canonical-doc, runbook, or provider-note.",
  "8. Update the work-item evidence with the relevant session-note and verification-result locators before closure.",
  "9. Close or archive the work-item when the slice is done.",
  "10. Commit memory-repo changes separately from code-repo changes.",
  "11. Push the memory-repo branch explicitly when the local commit should sync to a remote.",
] as const;

/**
 * Normalizes free-form chooser text for keyword matching.
 */
const normalizeText = (value: string): string => {
  return value.trim().toLowerCase();
};

/**
 * Returns `true` when the normalized text includes any of the provided patterns.
 */
const includesAny = (value: string, patterns: readonly string[]): boolean => {
  return patterns.some((pattern) => value.includes(pattern));
};

/**
 * Creates one tool recommendation entry for the chooser response.
 */
const createRecommendation = (
  name: string,
  reason: string,
): WorkflowToolRecommendation => {
  return {
    name,
    reason,
  };
};

/**
 * Chooses the stable-guidance write tool that best matches the user request.
 */
const chooseStableGuidanceTool = (value: string): WorkflowToolRecommendation => {
  if (includesAny(value, ["provider", "vendor", "api provider", "model provider"])) {
    return createRecommendation(
      "upsert_provider_note",
      "Provider-specific constraints and usage guidance belong in provider notes.",
    );
  }

  if (includesAny(value, ["procedure", "playbook", "operational", "runbook", "repeatable"])) {
    return createRecommendation(
      "create_runbook",
      "Repeatable operational guidance belongs in a runbook.",
    );
  }

  return createRecommendation(
    "upsert_canonical_doc",
    "Current stable guidance for one scoped topic belongs in a canonical doc.",
  );
};

/**
 * Chooses the next lifecycle action when the request already implies lifecycle state.
 */
const chooseLifecycleRecommendation = (
  goal: string,
  currentStep: string | undefined,
): WorkflowChoiceResult | undefined => {
  const combined = normalizeText(`${goal} ${currentStep ?? ""}`);
  const wantsLifecycleHelp =
    currentStep !== undefined
    || includesAny(combined, [
      "what next",
      "next step",
      "which tool next",
      "what should i do next",
      "after this",
      "after that",
      "what now",
    ]);

  if (!wantsLifecycleHelp) {
    return undefined;
  }

  if (includesAny(combined, ["closed work-item", "close_work_item", "archived work-item", "archive_work_item"])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The work-item is already in a terminal state, so the remaining lifecycle actions are the memory-repo commit and any explicit remote push.",
      recommendedTools: [
        createRecommendation(
          "commit_pending_changes",
          "Commit the memory-repo updates after the work-item lifecycle is complete.",
        ),
        createRecommendation(
          "push_pending_changes",
          "Push the resulting memory-repo commit when it should leave the local checkout.",
        ),
      ],
      nextStep: "Call commit_pending_changes after reviewing the pending memory-repo diff, then push_pending_changes if the new commit should sync to a remote.",
      lifecyclePosition: "post-close-pre-commit",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "Memory-repo commits stay separate from code-repo commits.",
        "Remote sync is explicit so agents do not assume origin or branch behavior silently.",
      ],
    };
  }

  if (includesAny(combined, [
    "commit_pending_changes",
    "committed memory-repo",
    "committed memory repo",
    "memory-repo commit",
    "memory repo commit",
  ])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The local memory-repo commit already exists, so the remaining optional lifecycle action is explicit remote synchronization.",
      recommendedTools: [
        createRecommendation(
          "push_pending_changes",
          "Push the current memory-repo branch when the local commit should sync to a configured remote.",
        ),
      ],
      nextStep: "Call push_pending_changes if the committed memory-repo branch should be pushed.",
      lifecyclePosition: "post-commit-pre-push",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "The push step is separate so callers can still inspect, amend, or defer remote synchronization after the local commit.",
      ],
    };
  }

  if (includesAny(combined, ["implemented", "implementation complete", "code changed", "investigated", "analysis complete"])
    && !includesAny(combined, ["session note", "session-note", "append_session_note"])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "Implementation has moved forward, but the chronological execution record is not captured yet.",
      recommendedTools: [
        createRecommendation(
          "append_session_note",
          "Record what happened during execution before the slice drifts into undocumented work.",
        ),
        createRecommendation(
          "record_verification_result",
          "After the session note, capture concrete evidence from the checks that completed.",
        ),
      ],
      nextStep: "Call append_session_note first, then record_verification_result once the relevant checks are clear.",
      lifecyclePosition: "post-implementation-pre-session-note",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "If no meaningful check has completed yet, stop after the session note and record verification later.",
        "If the slice changed code, record a verification-result describing the checks that actually ran before treating the work-item as done.",
      ],
    };
  }

  if (includesAny(combined, ["session note", "session-note", "append_session_note"])
    && !includesAny(combined, ["verification-result", "record_verification_result", "verification recorded", "evidence recorded"])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The execution chronology is already recorded, but the evidence step is still missing.",
      recommendedTools: [
        createRecommendation(
          "record_verification_result",
          "Capture the concrete result of the test, review, or validation step that completed.",
        ),
      ],
      nextStep: "Call record_verification_result next.",
      lifecyclePosition: "post-session-note-pre-verification",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "Verification results record evidence, not broad narrative context.",
        "If the slice changed code, the verification-result should describe the checks that actually ran before closure.",
      ],
    };
  }

  if (includesAny(combined, ["verification-result", "record_verification_result", "verification recorded", "evidence recorded"])
    && includesAny(combined, ["policy", "architecture", "constraint", "decision", "rationale"])) {
    const stableGuidanceTool = chooseStableGuidanceTool(combined);

    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "Verification is already captured and the remaining work is to preserve durable policy or guidance changes.",
      recommendedTools: [
        createRecommendation(
          "create_decision",
          "Durable reasoning and chosen direction belong in a decision record.",
        ),
        stableGuidanceTool,
      ],
      nextStep: `Call create_decision first, then ${stableGuidanceTool.name} if stable guidance changed.`,
      lifecyclePosition: "post-verification-pre-durable-guidance",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "Use a decision only when policy or architecture changed; otherwise skip directly to updating work-item evidence or closure.",
      ],
    };
  }

  if (includesAny(combined, [
    "decision recorded",
    "create_decision",
    "canonical doc updated",
    "canonical-doc updated",
    "runbook updated",
    "provider note updated",
    "provider-note updated",
    "stable guidance updated",
  ])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The durable records are already updated, so the slice should move toward closure.",
      recommendedTools: [
        createRecommendation(
          "upsert_work_item",
          "Update the work-item evidence so the session-note and verification-result records are linked explicitly before closure.",
        ),
        createRecommendation(
          "close_work_item",
          "Close the executable work slice once the work-item evidence and durable guidance are already recorded.",
        ),
        createRecommendation(
          "archive_work_item",
          "Archive later if the finished work-item should leave the active planning surface.",
        ),
      ],
      nextStep: "Call upsert_work_item next to link the relevant session-note and verification-result locators in evidence, then close_work_item, then archive_work_item only if the finished slice should disappear from active planning.",
      lifecyclePosition: "pre-close",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "Closing changes execution state; archiving changes managed visibility.",
        "close_work_item does not create evidence records or add their locators to the work-item.",
      ],
    };
  }

  if (
    includesAny(combined, [
      "verification-result",
      "record_verification_result",
      "verification recorded",
      "evidence recorded",
    ])
    && !includesAny(combined, [
      "work-item evidence updated",
      "updated work-item evidence",
      "evidence linked",
      "linked the evidence",
      "upsert_work_item",
    ])
  ) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The checks are already recorded, but the work-item still needs explicit evidence links before it should move to a terminal state.",
      recommendedTools: [
        createRecommendation(
          "upsert_work_item",
          "Link the relevant session-note and verification-result locators through the work-item evidence field before closure.",
        ),
        createRecommendation(
          "close_work_item",
          "Apply the terminal work-item state after the evidence links are in place.",
        ),
      ],
      nextStep: "Call upsert_work_item next to add the relevant session-note and verification-result locators to evidence, then close_work_item when the slice is actually done.",
      lifecyclePosition: "post-verification-pre-evidence-update",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "archive_work_item",
          "Archive later if the finished work-item should leave the active planning surface after closure.",
        ),
      ],
      notes: [
        "Done work-items require at least one session-note locator in evidence.",
        "If the slice changed code, record a verification-result describing the checks that actually ran before closure.",
      ],
    };
  }

  if (includesAny(combined, [
    "work-item evidence updated",
    "updated work-item evidence",
    "evidence linked",
    "linked the evidence",
    "upsert_work_item",
  ])) {
    return {
      goal,
      currentStep,
      route: "lifecycle-next-step",
      why: "The work-item evidence is already linked, so the remaining lifecycle action is terminal closure and optional later archival.",
      recommendedTools: [
        createRecommendation(
          "close_work_item",
          "Apply the terminal state once the work-item itself reflects the recorded evidence.",
        ),
        createRecommendation(
          "archive_work_item",
          "Archive later if the finished work-item should disappear from active planning.",
        ),
      ],
      nextStep: "Call close_work_item next, then archive_work_item only if the finished slice should disappear from active planning.",
      lifecyclePosition: "post-evidence-update-pre-close",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [],
      notes: [
        "close_work_item changes execution state only; it does not add evidence locators for you.",
      ],
    };
  }

  return undefined;
};

/**
 * Chooses the bounded-read or maintenance tool that best matches the user goal.
 */
const chooseReadRecommendation = (goal: string): WorkflowChoiceResult => {
  const normalizedGoal = normalizeText(goal);

  if (includesAny(normalizedGoal, ["exact path", "exact file", "known path", "repository-relative path"])) {
    return {
      goal,
      route: "maintenance-direct-read",
      why: "The request already points to one exact managed file, so a direct read is the narrowest surface.",
      recommendedTools: [
        createRecommendation(
          "read_document",
          "Use the direct validated read when the exact managed path is already known.",
        ),
      ],
      nextStep: "Call read_document with the exact managed repository-relative path.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "list_documents",
          "Use list_documents only if you need to confirm the exact path first.",
        ),
      ],
      notes: [
        "Direct reads reject unmanaged paths and schema-invalid files.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["keyword", "search", "find text", "full text", "recall"])) {
    return {
      goal,
      route: "maintenance-search",
      why: "The request is broad keyword recall rather than a bounded startup or topic question.",
      recommendedTools: [
        createRecommendation(
          "search_documents",
          "Search is the maintenance primitive for broad text recall across managed documents.",
        ),
      ],
      nextStep: "Call search_documents with the project and search text.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "read_topic_entry",
          "If the need is current truth for one topic rather than broad text recall, prefer topic-entry.",
        ),
      ],
      notes: [
        "Prefer bounded reads before search when the request maps cleanly to startup, planning, topic, or rationale lookup.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["audit", "inventory", "list documents", "metadata view", "enumerate"])) {
    return {
      goal,
      route: "maintenance-list",
      why: "The request is for inventory or metadata inspection rather than bounded topic retrieval.",
      recommendedTools: [
        createRecommendation(
          "list_documents",
          "Listing is the maintenance primitive for metadata audits and known-scope inspection.",
        ),
      ],
      nextStep: "Call list_documents with the narrowest project or type filters available.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "search_documents",
          "Use search_documents instead if you need keyword recall rather than metadata inventory.",
        ),
      ],
      notes: [
        "List and search are maintenance primitives, not the default startup path.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["why", "rationale", "reasoning", "history", "decision background"])) {
    return {
      goal,
      route: "bounded-read-rationale",
      why: "The request asks for durable reasoning rather than current truth or execution state.",
      recommendedTools: [
        createRecommendation(
          "read_rationale_entry",
          "Rationale entry packages canonical context, decisions, and supporting records for one same-project topic.",
        ),
      ],
      nextStep: "Call read_rationale_entry for the topic you need to explain.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "read_topic_entry",
          "Use topic-entry instead if you need current truth rather than the reasoning behind it.",
        ),
      ],
      notes: [
        "Rationale reads stay bounded and same-project by default.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["current truth", "current guidance", "current policy", "canonical", "what is current"])) {
    return {
      goal,
      route: "bounded-read-topic",
      why: "The request is for current topic truth rather than executable planning state or rationale history.",
      recommendedTools: [
        createRecommendation(
          "read_topic_entry",
          "Topic entry prioritizes canonical docs and exact-topic supporting documents for one same-project topic.",
        ),
      ],
      nextStep: "Call read_topic_entry for the topic you need to understand.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "read_rationale_entry",
          "Use rationale-entry instead if you need the durable reasoning behind the current model.",
        ),
      ],
      notes: [
        "Topic entry intentionally excludes work-item planning context.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["dependency", "dependencies", "evidence", "execution context", "selected work", "one work-item topic", "work-item topic"])) {
    return {
      goal,
      route: "bounded-read-planning-topic",
      why: "The request is for one work-item topic with explicit dependency, context, or evidence follow.",
      recommendedTools: [
        createRecommendation(
          "read_planning_topic_entry",
          "Planning topic entry is the bounded execution-context surface for one same-project work-item topic.",
        ),
      ],
      nextStep: "Call read_planning_topic_entry for the selected work-item topic.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "read_planning_backlog",
          "Use planning-backlog first if you have not chosen the work-item slice yet.",
        ),
      ],
      notes: [
        "Planning topic entry follows only explicit same-project dependency, context, and evidence references.",
      ],
    };
  }

  if (includesAny(normalizedGoal, ["backlog", "ready", "blocked", "in progress", "work-item", "planning"])) {
    return {
      goal,
      route: "bounded-read-planning-backlog",
      why: "The request is about executable work selection or planning state rather than durable topic truth.",
      recommendedTools: [
        createRecommendation(
          "read_planning_backlog",
          "Planning backlog is the primary bounded surface for ready, in-progress, and blocked same-project work items.",
        ),
      ],
      nextStep: "Call read_planning_backlog first, then read_planning_topic_entry if one work-item topic needs deeper execution context.",
      lifecyclePosition: "bounded-context",
      lifecycleGuide: [...lifecycleGuide],
      alternatives: [
        createRecommendation(
          "read_planning_topic_entry",
          "Use planning-topic-entry after backlog selection or when the target work-item topic is already known.",
        ),
      ],
      notes: [
        "Do not infer backlog state from decisions or session history alone.",
      ],
    };
  }

  return {
    goal,
    route: "bounded-read-cold-start",
    why: "No narrower maintenance or planning signal dominates, so the safest default is the bounded startup package.",
    recommendedTools: [
      createRecommendation(
        "read_cold_start",
        "Cold start is the default first read for project context without scanning the repository.",
      ),
    ],
    nextStep: "Call read_cold_start first, then choose planning, topic, or rationale surfaces from the returned context.",
    lifecyclePosition: "bounded-context",
    lifecycleGuide: [...lifecycleGuide],
    alternatives: [
      createRecommendation(
        "read_planning_backlog",
        "Use planning-backlog instead if the goal is explicitly about executable work selection.",
      ),
      createRecommendation(
        "read_topic_entry",
        "Use topic-entry instead if the goal is explicitly about the current truth of one topic.",
      ),
    ],
    notes: [
      "This chooser is a fallback explainer, not an automatic router.",
    ],
  };
};

/**
 * Executes the `choose_workflow` MCP tool.
 */
export const chooseWorkflowTool = (params: unknown): unknown => {
  const input = parseChooseWorkflowInput(params);

  return chooseLifecycleRecommendation(input.goal, input.currentStep) ?? chooseReadRecommendation(input.goal);
};
