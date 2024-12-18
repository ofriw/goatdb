import { sessionIdFromSignature } from '../db/session.ts';
import { Authorizer, Repository, RepoStorage } from './repo.ts';

const PERSONAL_WS_KEY_SUFFIX = '-ws';

export type FetchOperatorEmails = () => readonly string[];

/**
 * Creates and returns an Authorizer function for /sys/dir.
 *
 * @param fetchOperatorEmails A function that fetches the current list of
 *                            operator emails.
 * @returns An authorizer function for /sys/dir.
 */
export function createSysDirAuthorizer<ST extends RepoStorage<ST>>(
  fetchOperatorEmails: FetchOperatorEmails,
): Authorizer<ST> {
  // ATTENTION: We decide which session to look at based on the operation:
  // For reads, we take the calling session while for writes we use the signer
  // of the commit (so p2p replication works for others' commits).
  return (repo, commit, session, write: boolean) => {
    if (!commit.signature) {
      return false;
    }
    let userKey: string | undefined;
    if (commit.key === session.id || write === false) {
      userKey = session.owner;
    } else if (write === true) {
      const commitSignerSession = repo.trustPool.getSession(
        sessionIdFromSignature(commit.signature),
      );
      userKey = commitSignerSession?.owner;
    }
    // Anonymous users are allowed to only read their own session
    if (!userKey) {
      return !write && commit.key === session.id;
    }
    // Root access
    if (userKey === 'root') {
      return true;
    }
    // Operator Access
    const record = repo.valueForKeyReadonlyUnsafe(commit.key);
    const userRecord = repo.valueForKeyReadonlyUnsafe(userKey);
    const email =
      userRecord.scheme.namespace === SchemeNamespace.USERS
        ? userRecord.get<string>('email')
        : undefined;
    const operatorEmails = fetchOperatorEmails();
    const isOperator =
      typeof email === 'string' && operatorEmails.includes(email);

    // If a current record doesn't exist, and we got a delta commit or a null
    // commit, reject it as an invalid case.
    if (record.isNull && (!commit.scheme || commit.scheme?.isNull)) {
      return false;
    }
    // Derive the scheme either from the existing record (update) or from the
    // new commit (create).
    const namespace = record.isNull
      ? commit.scheme?.namespace
      : record.scheme.namespace;
    // Per-namespace breakdown of permissions
    switch (namespace) {
      // Read-write access to members only
      case SchemeNamespace.WORKSPACE: {
        // Operators are allowed to access all workspaces
        if (isOperator) {
          return true;
        }
        // Anyone is allowed to create new workspaces
        if (record.isNull) {
          return write === true;
        }
        // Only members of an existing workspace are allowed to edit it
        const users = record.get<Set<string>>('users');
        return users?.has(userKey) === true;
      }

      // Readonly access to everyone. Operators are transparent to everyone but
      // other operators.
      case SchemeNamespace.USERS: {
        // Operators are allowed to access all users
        if (isOperator) {
          return true;
        }
        if (userRecord.scheme.namespace !== SchemeNamespace.USERS) {
          return false;
        }
        // Operator users are invisible to all other users
        if (
          userRecord.has('email') &&
          operatorEmails.includes(userRecord.get('email'))
        ) {
          return false;
        }
        const userPermissions =
          userRecord.get<Set<UserPermission>>('permissions') || new Set();

        // manage:users grants full write access to all user records
        if (userPermissions?.has('manage:users') === true) {
          return true;
        }
        // Creating users is only allowed for: root, operators and anyone with
        // manage:users permission.
        if (record.isNull) {
          return false;
        }
        if (userKey === commit.key) {
          // Users are allowed to update their own records, as long as they don't
          // touch protected fields
          if (!write) {
            return true;
          }
          const changedFields = repo.changedFieldsInCommit(commit);
          // Wait for the full commit graph before allowing dangerous changes
          if (!changedFields) {
            return false;
          }
          // Regular users aren't allowed to edit their own email to avoid
          // privileges escalation.
          if (changedFields.includes('email')) {
            return false;
          }
          // Users can't edit their own permissions
          if (changedFields.includes('permissions')) {
            return false;
          }
          // All other fields are OK to be edited by their owner
          return true;
        }
        // Readonly access for everyone else
        return write === false;
      }

      // Readonly access to everyone. Only root is allowed to update sessions.
      case SchemeNamespace.SESSIONS:
        return write === false;

      default:
        return false;
    }
  };
}

/**
 * Creates and returns an Authorizer function for a workspace repository.
 *
 * @param fetchOperatorEmails A function that fetches the current list of
 *                            operator emails.
 * @param sysDir The /sys/dir repository.
 * @param workspaceKey The key of this workspace in /sys/dir.
 * @returns An authorizer function for a workspace repository.
 */
export function createWorkspaceAuthorizer<ST extends RepoStorage<ST>>(
  fetchOperatorEmails: FetchOperatorEmails,
  sysDir: Repository<ST>,
  workspaceKey: string,
): Authorizer<ST> {
  // ATTENTION: We decide which session to look at based on the operation:
  // For reads, we take the calling session while for writes we use the signer
  // of the commit (so p2p replication works for others' commits).
  return (repo, commit, session, write: boolean) => {
    if (!commit.signature) {
      return false;
    }
    let userKey: string | undefined;
    if (write === false) {
      userKey = session.owner;
    } else if (write === true) {
      const commitSignerSession = repo.trustPool.getSession(
        sessionIdFromSignature(commit.signature),
      );
      userKey = commitSignerSession?.owner;
    }
    // Anonymous session
    if (!userKey) {
      return false;
    }
    // Root access
    if (userKey === 'root') {
      return true;
    }

    // Personal workspace is accessible only to its owner. Not even operators
    // are allowed to touch it.
    if (workspaceKey.endsWith(PERSONAL_WS_KEY_SUFFIX)) {
      return (
        userKey ===
        workspaceKey.substring(
          0,
          workspaceKey.length - PERSONAL_WS_KEY_SUFFIX.length,
        )
      );
    }

    // Operator Access
    const userRecord = sysDir.valueForKeyReadonlyUnsafe(userKey);
    const email =
      userRecord.scheme.namespace === SchemeNamespace.USERS
        ? userRecord.get<string>('email')
        : undefined;
    const isOperator = email && fetchOperatorEmails().includes(email);
    if (isOperator) {
      return true;
    }

    // Full read-write for workspace members
    const workspaceRecord = sysDir.valueForKeyReadonlyUnsafe(workspaceKey);
    const users =
      workspaceRecord.scheme.namespace === SchemeNamespace.WORKSPACE
        ? workspaceRecord.get<Set<string>>('users')
        : undefined;
    return users?.has(userKey) === true;
  };
}

export function createUserAuthorizer<ST extends RepoStorage<ST>>(
  sysDir: Repository<ST>,
  repoUserKey: string,
): Authorizer<ST> {
  // ATTENTION: We decide which session to look at based on the operation:
  // For reads, we take the calling session while for writes we use the signer
  // of the commit (so p2p replication works for others' commits).
  return (repo, commit, session, write: boolean) => {
    if (!commit.signature) {
      return false;
    }
    let requestingUserKey: string | undefined;
    if (write === false) {
      requestingUserKey = session.owner;
    } else if (write === true) {
      const commitSignerSession = repo.trustPool.getSession(
        sessionIdFromSignature(commit.signature),
      );
      requestingUserKey = commitSignerSession?.owner;
    }
    // Access to personal repo is allowed only to its owner and root.
    return requestingUserKey === 'root' || requestingUserKey === repoUserKey;
  };
}
