export const DOCS = {
  features: {
    architectureRoadmap: featurePaths('architecture-roadmap'),
    autocompleteRefactor: featurePaths('autocomplete-refactor'),
    aiRunner: featurePaths('ai-runner'),
    backlogPrioritization: featurePaths('backlog-prioritization'),
    codexSkills: featurePaths('codex-skills'),
    dataExportAndBackup: featurePaths('data-export-and-backup'),
    externalCollectors: featurePaths('external-collectors'),
    ideaPortfolio: featurePaths('idea-portfolio'),
    operatorDiagnostics: featurePaths('operator-diagnostics'),
    paymentTestAndSeo: featurePaths('payment-test-and-seo'),
    pivotPersevereLoop: featurePaths('pivot-persevere-loop'),
    postLaunchMeasurement: featurePaths('post-launch-measurement'),
    qualityHardening: featurePaths('quality-hardening'),
    releasePackaging: featurePaths('release-packaging'),
    roadmapGovernance: featurePaths('roadmap-governance'),
    scheduledRevalidation: featurePaths('scheduled-revalidation'),
    sqliteFoundation: featurePaths('sqlite-foundation'),
    webInterface: featurePaths('web-interface'),
    workflowRecipes: featurePaths('workflow-recipes'),
  },
  governance: {
    backlogPrioritization: 'docs/governance/backlog-prioritization.md',
    implementationOrder: 'docs/governance/implementation-order.md',
    roadmapGovernance: 'docs/governance/roadmap-governance.md',
    templates: {
      backlogItem: 'docs/governance/templates/backlog-item.md',
      implementationNote: 'docs/governance/templates/implementation-note.md',
      phase: 'docs/governance/templates/phase.md',
    },
  },
  handoff: {
    nextAgentTickets: 'docs/handoff/next-agent-tickets.md',
    root: 'docs/handoff',
  },
  reference: {
    architecture: 'docs/reference/architecture.md',
    commands: 'docs/reference/commands.md',
    install: 'docs/reference/install.md',
    releaseChecklist: 'docs/reference/release-checklist.md',
    root: 'docs/reference',
  },
  recipes: {
    files: [
      'backup-and-restore.md',
      'compare-idea-portfolio.md',
      'decide-pivot-or-persevere.md',
      'diagnose-local-setup.md',
      'measure-experiment.md',
      'revalidate-stale-evidence.md',
      'run-payment-test.md',
      'validate-one-idea.md',
    ],
    index: 'docs/recipes/README.md',
    root: 'docs/recipes',
  },
  root: {
    docsIndex: 'docs/README.md',
  },
  status: {
    implementedFeatures: 'docs/status/implemented-features.md',
    root: 'docs/status',
  },
};

export function featurePaths(slug: string): {
  implementation: string;
  plan: string;
  readme: string;
  slug: string;
} {
  return {
    implementation: `docs/features/${slug}/implementation.md`,
    plan: `docs/features/${slug}/plan.md`,
    readme: `docs/features/${slug}/README.md`,
    slug,
  };
}
