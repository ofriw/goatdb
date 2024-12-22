import { CoreObject, ReadonlyCoreObject } from './base/core-types/index.ts';
import { SchemaFieldsDef, SchemaManager } from './cfds/base/schema.ts';
import { initRichText } from './cfds/richtext/tree.ts';
import { GoatDB } from './db/db.ts';
import { Query } from './repo/query.ts';
import { Repository } from './repo/repo.ts';

const kBaseFields: SchemaFieldsDef = {
  creationDate: {
    type: 'date',
    required: true,
    default: () => new Date(),
  },
  lastModified: {
    type: 'date',
    default: (d: ReadonlyCoreObject) => d['creationDate'] as Date,
  },
  sortStamp: {
    type: 'string',
  },
} as const;

const kContentFields: SchemaFieldsDef = {
  ...kBaseFields,
  createdBy: {
    type: 'string',
  },
  workspace: {
    type: 'string',
    // required: true,
  },
} as const;

const kSchemeWorkspace = {
  ns: 'workspaces',
  version: 6,
  fields: {
    ...kContentFields,
    name: {
      type: 'string',
      required: true,
    },
    users: {
      type: 'set',
    },
    icon: {
      type: 'string',
    },
    noteTags: {
      type: 'map',
      default: () => new Map(),
    },
    taskTags: {
      type: 'map',
      default: () => new Map(),
    },
    isTemplate: {
      type: 'number',
    },
    createdBy: {
      type: 'string',
    },
  },
} as const;

SchemaManager.default.register(kSchemeWorkspace);

const kSchemeUser = {
  ns: 'users',
  version: 6,
  fields: {
    ...kBaseFields,
    email: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    permissions: {
      type: 'set',
    },
    metadata: {
      type: 'map',
    },
  },
} as const;

SchemaManager.default.register(kSchemeUser);

const kSchemeUserSettings = {
  ns: 'user-settings',
  version: 6,
  fields: {
    ...kBaseFields,
    lastLoggedIn: {
      type: 'date',
    },
    seenTutorials: {
      type: 'set',
    },
    workspaceColors: {
      type: 'map',
    },
    hiddenWorkspaces: {
      type: 'set',
    },
    pinnedWorkspaces: {
      type: 'set',
    },
    onboardingStep: {
      type: 'number',
    },
  },
} as const;

SchemaManager.default.register(kSchemeUserSettings);

const kSchemeNote = {
  ns: 'notes',
  version: 6,
  fields: {
    ...kContentFields,
    assignees: {
      type: 'set',
      default: () => new Set<string>(),
    },
    timeTrack: {
      type: 'set',
      default: () => new Set<CoreObject>(),
    },
    attachments: {
      type: 'set',
      default: () => new Set<CoreObject>(),
    },
    body: {
      type: 'richtext',
    },
    dueDate: {
      type: 'date',
    },
    title: {
      type: 'richtext',
    },
    parentNote: {
      type: 'string',
    },
    status: {
      type: 'number',
    },
    tags: {
      type: 'map',
      default: () => new Map(),
    },
    type: {
      type: 'string',
    },
    pinnedBy: {
      type: 'map',
    },
    completionDate: {
      type: 'date',
    },
  },
} as const;

SchemaManager.default.register(kSchemeNote);

const kSchemeTag = {
  ns: 'tags',
  version: 6,
  fields: {
    ...kContentFields,
    color: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    parentTag: {
      type: 'string',
    },
  },
} as const;

SchemaManager.default.register(kSchemeTag);

const kSchemeView = {
  ns: 'views',
  version: 6,
  fields: {
    owner: {
      type: 'string',
      required: true,
    },
    parentView: {
      type: 'string',
    },
    // Screen-level settings
    selectedSettingsTab: {
      type: 'string',
    }, //ADDED 12.11
    // selectedSettingsWorkspaces: 'string', //ADDED 24.12
    selectedTab: {
      type: 'string',
    },
    noteType: {
      type: 'string',
    },
    workspaceGrouping: {
      type: 'string',
    },
    selectedWorkspaces: {
      type: 'set',
    },
    expandedWorkspaceGroups: {
      type: 'set',
    },
    workspaceBarCollapsed: {
      type: 'number',
    },

    // Tab-level settings
    selectedAssignees: {
      type: 'set',
    },
    selectedTagIds: {
      type: 'set',
    },
    showChecked: {
      type: 'string',
    },
    sortBy: {
      type: 'string',
    },
    showPinned: {
      type: 'string',
    },
    groupBy: {
      type: 'string',
    },
    pivot: {
      type: 'string',
    },
    viewType: {
      type: 'string',
    },
    notesExpandOverride: {
      type: 'set',
    },
    notesExpandBase: {
      type: 'number',
    },
    dateFilter: {
      type: 'string',
    },
    expandedGroupIds: {
      type: 'set',
    },
  },
} as const;

SchemaManager.default.register(kSchemeView);

const kSchemeEvent = {
  ns: 'events',
  version: 6,
  fields: {
    json: {
      type: 'string',
      required: true,
    },
  },
} as const;

SchemaManager.default.register(kSchemeEvent);

async function main(): Promise<void> {
  const start = performance.now();
  const db = new GoatDB({
    path: '/Users/ofri/Documents/ovvio/serverdata/',
    orgId: 'baluka',
  });
  const repo = await db.open(Repository.path('test', 'baluka-union'));
  console.log(`Total time: ${(performance.now() - start) / 1000}sec`);
  debugger;
  console.log(Array.from(repo.keys()).length);
  console.log(Array.from(repo.commits()).length);
  const notesQuery = new Query({
    source: repo,
    predicate: (key, doc) => doc.scheme.ns === 'notes',
  });
  notesQuery.onLoadingFinished(() => {
    console.log(
      `Notes query finished. Count: ${notesQuery.count}. Time: ${
        notesQuery.scanTimeMs / 1000
      }sec`,
    );
  });
  const events = new Query({
    source: repo,
    predicate: (key, doc) => doc.scheme.ns === 'events',
  });
  events.onLoadingFinished(() => {
    console.log(
      `Events query finished. Count: ${events.count}. Time: ${
        events.scanTimeMs / 1000
      }sec`,
    );
  });
  const tags = new Query({
    source: repo,
    predicate: (key, doc) => doc.scheme.ns === 'tags',
  });
  tags.onLoadingFinished(() => {
    console.log(
      `Tags query finished. Count: ${tags.count}. Time: ${
        tags.scanTimeMs / 1000
      }sec`,
    );
  });
  const workspaces = new Query({
    source: repo,
    predicate: (key, doc) => doc.scheme.ns === 'workspaces',
  });
  workspaces.onLoadingFinished(() => {
    console.log(
      `Workspaces query finished. Count: ${workspaces.count}. Time: ${
        workspaces.scanTimeMs / 1000
      }sec`,
    );
  });
}

main();
