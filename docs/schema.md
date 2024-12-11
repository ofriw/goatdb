# GoatDB Schemas

A [schema](concepts.md) in GoatDB defines the structure of an [item](concepts.md). Schemas are plain JavaScript objects that are compiled into the resulting executable and are not stored directly in the database's storage. Schemas are versioned, allowing multiple versions of the same schema to coexist on different branches, which simplifies rolling deployments.

Each schema has a namespace that defines the type of item it manages. Multiple schemas with different namespaces can exist in a single repository.

## The Schema Manager

A schema must be registered with a [Schema Manager](../cfds/base/schema.ts) before it can be used to create and manipulate items. The **SchemaManager** acts as a registry for schemas within the database. Multiple managers may exist and be attached to different database instances, but the default manager is sufficient for most applications.

The default schema manager can be accessed as follows:

```javascript
const manager = SchemaManager.default;
```

## Defining a New Schema

```javascript
export const kSchemeMessage = {
  ns: 'message',
  version: 1,
  fields: {
    sender: {
      type: 'string',
      required: true,
    },
    value: {
      type: 'string',
      required: true,
    },
  },
} as const;
SchemaManager.default.register(kSchemeMessage);
type SchemeMessageType = typeof kSchemeMessage;
```

1. **Define the Schema:** Create a plain constant object with the following fields:

   - **ns:** The namespace of the schema. This is used to differentiate items within the same repository.
   - **version:** The version of the schema. This number must be consecutive.
   - **fields:** The fields and their respective types for the item.

2. **Register the Schema:** Register the schema with the default schema manager to make it available for use in the database.

3. **Define a Type:** Define a convenience type for the schema to facilitate easier usage later.

## Upgrading a Schema

Upgrading a schema in GoatDB is straightforward and involves registering a new schema with an incremented version number. Additionally, an optional upgrade function can be included to handle data transformations during the schema upgrade process. For example, the following demonstrates how to add a new timestamp field and rename the value field to contents. This approach ensures backward compatibility while enabling seamless transitions to newer schema versions.

```javascript
export const kSchemeMessageV2 = {
  ns: 'message',
  version: 2,
  fields: {
    sender: {
      type: 'string',
      required: true,
    },
    contents: {
      type: 'string',
      required: true,
    },
    timestamp: {
      type: 'date',
      default: () => new Date(),
    },
    upgrade: (data) => {
      data.set('contents', data.get('value'));
      return data;
    },
  },
} as const;
SchemaManager.default.register(kSchemeMessageV2);
```

### The Upgrade Function

The upgrade function handles data transformations needed during schema transitions. It should only account for migrating data from the immediately preceding schema version. When upgrading across multiple versions, GoatDB sequentially applies the upgrade functions from each intermediate version, ensuring a smooth and consistent transition.

## Supported Field Types

The list of supported field types is continually expanding to accommodate more use cases and conflict resolution strategies. If you have a specific requirement for a new data type or conflict resolution approach, please let us know!

### Number

**Type:** `number`

**Conflict Resolution:** Any Write Wins.

### Boolean

**Type:** `boolean`

**Conflict Resolution:** Any Write Wins.

### Date

**Type:** `date`

**Conflict Resolution:** Any Write Wins.

### Set

**Type:** `set`

**Conflict Resolution:**

1. Additions take precedence over deletions.
2. Deleting works only on elements that have existed in the base version of the three-way merge, which refers to the common ancestor state shared by the conflicting changes being merged.

### Map

**Type:** `map`

**Conflict Resolution:**

1. Additions and edits take precedence over deletions.
2. Deleting works only on elements that have existed in the base version of the three-way merge, which refers to the common ancestor state shared by the conflicting changes being merged.

### Rich Text

**Type:** `richtext`

**Conflict Resolution:**

1. Additions and edits take precedence over deletions.
2. Deleting works only on elements that have existed in the base version of the three way merge.
3. Operates at the granularity of individual element nodes and single characters, meaning changes can be applied to precise parts of the text, such as modifying a single word or even a single letter, without affecting the surrounding content.
