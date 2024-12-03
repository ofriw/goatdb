import { BaseLogEntry } from './entry.ts';

export type ClientEvent =
  | 'SessionAlive'
  | 'SessionEnd'
  | 'AttachmentDownloadSuccess'
  | 'MetadataChanged'
  | 'VertexMoved'
  | 'Click'
  | 'FilterChange'
  | 'ViewChange'
  | 'Start'
  | 'End'
  | 'Cancel'
  | 'Navigation'
  | 'Create'
  | 'Delete'
  | 'Duplicate'
  | 'CopyInto'
  | 'Show'
  | 'Hide';

export type SettingsType = 'settings:workspace' | 'settings:tags';

export type EditorUISource =
  | 'editor'
  | 'editor:task-cta'
  | 'editor:key-down'
  | 'editor:title'
  | 'editor:body'
  | 'editor:body:inline-task'
  | 'editor:legend'
  | 'editor:tooltip';

export type ToolbarUISource =
  | 'toolbar'
  | 'toolbar:filterButton'
  | 'toolbar:compose'
  | 'toolbar:search'
  | 'toolbar:tab:tasks'
  | 'toolbar:tab:notes'
  | 'toolbar:menu'
  | 'toolbar:header'
  | 'toolbar:logo'
  | 'toolbar:groupBy'
  | 'toolbar:viewType'
  | 'toolbar:sortBy'
  | 'toolbar:filterMenu';

export type MenuUISource =
  | 'menu'
  | 'menu:note'
  | 'menu:note:open'
  | 'menu:note:view-in-parent'
  | 'menu:note:delete'
  | 'menu:note:convert';

export type UIButton = 'button:close' | 'button:back';

export type UISource =
  | 'list'
  | 'title'
  | 'board'
  | 'child-item'
  | 'bar:workspace'
  | 'invite'
  | 'click-outside'
  | UIButton
  | SettingsType
  | EditorUISource
  | ToolbarUISource
  | MenuUISource;

export type MetadataType =
  | 'attachment'
  | 'assignee'
  | 'tag'
  | 'pin'
  | 'hide'
  | 'name'
  | 'status'
  | 'due'
  | 'type';

export type DataType = 'workspace' | 'note' | 'task' | 'tag' | 'tag-category';

export type UIStatus = 'started' | 'ended' | 'cancelled';

export type FilterType = 'workspace' | 'tag' | 'assignee';
// | `sortBy:${SortBy}`
// | `groupBy:${GroupBy}`;

export type UIFlow =
  | 'create'
  | 'delete'
  | 'permissions'
  | 'edit'
  | 'dnd'
  | 'search'
  | 'datePicker';

export type NavigationType = 'tab' | 'close' | 'open';

export type Reason = 'not-supported' | 'denied';

export interface ClientEventEntry extends BaseLogEntry {
  severity: 'EVENT';
  event: ClientEvent;
  foreground?: boolean;
  source?: UISource;
  destination?: UISource;
  vertex?: string;
  type?: MetadataType | FilterType | DataType | NavigationType; // | ViewType;
  added?: string | string[] | 'ALL';
  removed?: string | string[] | 'ALL';
  origin?: string;
  status?: UIStatus; // | NoteStatus;
  reason?: Reason;
  routeInfo?: string;
  flag?: boolean;
  flow?: UIFlow;
  id?: string;
  target?: string;
  value?: string;
  secondaryValue?: string;
}
