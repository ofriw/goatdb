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
  private _doc!: Item<S>;
  private _commitPromise?: Promise<void>;
  private _detachHandler?: () => void;

  constructor(readonly db: GoatDB, readonly path: string) {
    super();
    this.path = path;
    this._commitDelayTimer = new SimpleTimer(300, false, () => {
      this.commit();
    });
    const repo = db.getRepository(itemPathGetRepoId(path));
    if (!repo) {
      this._doc = Item.nullItem();
      this.loadRepoAndDoc();
    } else {
      this.loadInitialDoc(repo);
    }
  }

  /**
   * Returns the repository that manages this item.
   */
  get repository(): Repository | undefined {
    return this.db.getRepository(itemPathGetRepoId(this.path));
  }

  /**
   * Returns the current scheme of this item.
   */
  get scheme(): S {
    return this._doc.scheme;
  }

  /**
   * Updates the scheme for this item. Changing an item's scheme is allowed
   * under the following limitations:
   *
   * - A null item can have its scheme changed to any other scheme.
   *
   * - An item with a non-null scheme, may only have its scheme upgraded, that
   *   is the provided scheme must have the same namespace and its version must
   *   be greater than the current scheme's version.
   *
   * Explicitly setting the scheme is usually done only when creating a new
   * item.
   */
  set scheme(s: S) {
    if (this._doc.isLocked) {
      this._doc = this._doc.clone();
    }
    this._doc.upgradeScheme(s);
    this._commitDelayTimer.schedule();
  }

  /**
   * Returns whether this item has been deleted and is waiting to be garbage
   * collected at a later time.
   */
  get isDeleted(): boolean {
    return this._doc.isDeleted;
  }

  /**
   * Sets this item's delete marker. Used to delete/un-delete an item.
   */
  set isDeleted(flag: boolean) {
    const oldValue = this.isDeleted;
    if (oldValue !== flag) {
      this._doc.isDeleted = flag;
      this.onChange(['isDeleted', true, oldValue]);
    }
  }

  has<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    return this._doc.has(key);
  }

  get<K extends keyof SchemaDataType<S>>(
    key: K & string,
  ): SchemaDataType<S>[K] {
    return this._doc.get(key);
  }

  set<T extends keyof SchemaDataType<S>>(
    key: string & T,
    value: SchemaDataType<S>[T],
  ): void {
    const oldValue = this.has(key) ? this.get(key) : undefined;
    this._doc.set(key, value);
    this.onChange([key, true, oldValue]);
  }

  delete<T extends keyof SchemaDataType<S>>(key: string & T): boolean {
    const oldValue = this.has(key) ? this.get(key) : undefined;
    if (this._doc.delete(key)) {
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
      this._doc,
      this._head,
    );
    const changedFields = this._doc.diffKeys(doc, true);
    if (changedFields.length > 0) {
      let mutations: MutationPack;
      for (const f of changedFields) {
        mutations = mutationPackAppend(mutations, [f, false, this._doc.get(f)]);
      }
      this._doc = doc;
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
    // this._commitDelayTimer.schedule();
  }

  private async _commitImpl(): Promise<void> {
    this._commitDelayTimer.unschedule();
    const currentDoc = this._doc.clone();
    const key = itemPathGetPart(this.path, ItemPathPart.Item);
    const repo = await this.db.open(itemPathGetRepoId(this.path));
    const newHead = await repo.setValueForKey(key, currentDoc, this._head);
    if (newHead) {
      this.rebase();
    }
  }

  private async loadRepoAndDoc(): Promise<void> {
    this.loadInitialDoc(await this.db.open(itemPathGetRepoId(this.path)));
    let pack: MutationPack;
    for (const f of this._doc.keys) {
      pack = mutationPackAppend(pack, [f, false, undefined]);
    }
    this.emit('change', pack);
  }

  private loadInitialDoc(repo: Repository): void {
    const entry = repo.valueForKey<S>(
      itemPathGetPart(this.path, ItemPathPart.Item),
    );
    if (entry) {
      this._doc = entry[0].clone();
      this._head = entry[1];
      if (this._doc.upgradeSchemeToLatest()) {
        this._commitDelayTimer.schedule();
      }
    } else {
      this._doc = Item.nullItem();
    }
  }
}
