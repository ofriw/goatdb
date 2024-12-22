import { Schema, SchemaDataType } from '../cfds/base/schema.ts';
import { Commit } from '../repo/commit.ts';
import { Repository } from '../repo/repo.ts';
import { itemPathGetPart, itemPathGetRepoId, ItemPathPart } from './path.ts';
import { Item } from '../cfds/base/item.ts';
import { Emitter } from '../base/emitter.ts';
import { MutationPack, mutationPackAppend } from './mutations.ts';
import { SimpleTimer, Timer } from '../base/timer.ts';
import { GoatDB } from './db.ts';

export class ManagedItem<S extends Schema = Schema> extends Emitter<'change'> {
  private readonly _commitDelayTimer: Timer;
  private _head?: Commit;
  private _item!: Item<S>;
  private _commitPromise?: Promise<void>;
  private _detachHandler?: () => void;

  constructor(readonly db: GoatDB, readonly path: string) {
    super();
    this.path = path;
    this._commitDelayTimer = new SimpleTimer(300, false, () => {
      this.commit();
    });
    const repo = db.repository(itemPathGetRepoId(path));
    this._item = Item.nullItem();
    if (!repo) {
      this.loadRepoAndDoc();
    } else {
      this.loadInitialDoc(repo);
    }
  }

  /**
   * Returns the repository that manages this item.
   */
  get repository(): Repository | undefined {
    return this.db.repository(itemPathGetRepoId(this.path));
  }

  /**
   * Returns the current schema of this item.
   */
  get schema(): S {
    return this._item.schema;
  }

  /**
   * Updates the schema for this item. Changing an item's schema is allowed
   * under the following limitations:
   *
   * - A null item can have its schema changed to any other schema.
   *
   * - An item with a non-null schema, may only have its schema upgraded, that
   *   is the provided schema must have the same namespace and its version must
   *   be greater than the current schema's version.
   *
   * Explicitly setting the schema is usually done only when creating a new
   * item.
   */
  set schema(s: S) {
    if (this._item.isLocked) {
      this._item = this._item.clone();
    }
    this._item.upgradeSchema(s);
    this._commitDelayTimer.schedule();
  }

  /**
   * Returns whether this item has been deleted and is waiting to be garbage
   * collected at a later time.
   */
  get isDeleted(): boolean {
    return this._item.isDeleted;
  }

  /**
   * Sets this item's delete marker. Used to delete/un-delete an item.
   */
  set isDeleted(flag: boolean) {
    const oldValue = this.isDeleted;
    if (oldValue !== flag) {
      this._item.isDeleted = flag;
      this.onChange(['isDeleted', true, oldValue]);
    }
  }

  has<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    return this._item.has(key);
  }

  get<K extends keyof SchemaDataType<S>>(
    key: K & string,
  ): SchemaDataType<S>[K] {
    return this._item.get(key);
  }

  set<T extends keyof SchemaDataType<S>>(
    key: string & T,
    value: SchemaDataType<S>[T],
  ): void {
    const oldValue = this.has(key) ? this.get(key) : undefined;
    this._item.set(key, value);
    this.onChange([key, true, oldValue]);
  }

  /**
   * A convenience method for setting several fields and values at once.
   * @param data The values to set.
   */
  setMulti(data: Partial<SchemaDataType<S>>): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value!);
    }
  }

  delete<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    const oldValue = this.has(key) ? this.get(key) : undefined;
    if (this._item.delete(key)) {
      this.onChange([key, true, oldValue]);
      return true;
    }
    return false;
  }

  commit(): Promise<void> {
    if (!this._commitPromise) {
      const p = this._commitImpl().finally(() => {
        if (this._commitPromise === p) {
          this._commitPromise = undefined;
        }
      });
      this._commitPromise = p;
    }
    return this._commitPromise;
  }

  rebase(): void {
    const repo = this.repository;
    if (!repo) {
      return;
    }
    const [doc, head] = repo.rebase(
      itemPathGetPart(this.path, ItemPathPart.Item),
      this._item,
      this._head,
    );
    const changedFields = this._item.diffKeys(doc, true);
    if (changedFields.length > 0) {
      let mutations: MutationPack;
      for (const f of changedFields) {
        mutations = mutationPackAppend(mutations, [
          f,
          false,
          this._item.get(f),
        ]);
      }
      this._item = doc;
      this._head = head ? repo.getCommit(head) : undefined;
      this.onChange(mutations);
    }
  }

  reset(): void {}

  activate(): void {
    const repo = this.repository;
    if (!this._detachHandler && repo) {
      this._detachHandler = repo.attach('DocumentChanged', (key: string) => {
        if (itemPathGetPart(this.path, ItemPathPart.Item) === key) {
          this.rebase();
        }
      });
    }
  }

  deactivate(): void {
    if (this._detachHandler) {
      this._detachHandler();
      this._detachHandler = undefined;
    }
  }

  private onChange(
    mutations: MutationPack<keyof SchemaDataType<S> & string>,
  ): void {
    this.emit('change', mutations);
    this._commitDelayTimer.schedule();
  }

  private async _commitImpl(): Promise<void> {
    this._commitDelayTimer.unschedule();
    const currentDoc = this._item.clone();
    const key = itemPathGetPart(this.path, ItemPathPart.Item);
    const repo = await this.db.open(itemPathGetRepoId(this.path));
    const newHead = await repo.setValueForKey(key, currentDoc, this._head);
    if (newHead) {
      this.rebase();
    }
  }

  private async loadRepoAndDoc(): Promise<void> {
    this.loadInitialDoc(await this.db.open(itemPathGetRepoId(this.path)));
  }

  /**
   * Loads the initial item and schema from the repository. On creation, it also
   * kickstarts the initial commit process. This method must be called after
   * the repository had been fully loaded.
   *
   * @param repo The repository to load from.
   */
  private loadInitialDoc(repo: Repository): void {
    const entry = repo.valueForKey<S>(
      itemPathGetPart(this.path, ItemPathPart.Item),
    );
    if (this.schema.ns === null) {
      if (entry) {
        // If our contents are still null, replace them with the item and schema
        // from the repo.
        this._item = entry[0].clone();
        this._head = entry[1];
        // Auto upgrade the schema so the app is guaranteed to see the latest
        // version
        if (this._item.upgradeSchemaToLatest()) {
          // Commit after schema upgrade
          this._commitDelayTimer.schedule();
        }
        // Generate mutations for all initial values
        let pack: MutationPack;
        for (const f of this._item.keys) {
          pack = mutationPackAppend(pack, [f as string, false, undefined]);
        }
        this.emit('change', pack);
      }
    } else {
      // Our schema is no longer null which means a creation event had
      // happened. Rebase it over the latest item from the repo, which also
      // schedules a commit.
      this.rebase();
    }
  }
}
