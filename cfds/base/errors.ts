import { JSONValue } from '../../base/interfaces.ts';
import { log } from '../../logging/log.ts';

interface SerializedError {
  msg: string;
  code: Code;
  info?: JSONValue;
}

export enum Code {
  BadRequest = 400,
  AccessDenied = 403,
  NotFound = 404,
  Timeout = 408,
  Conflict = 409, // Not used
  InternalServerError = 500,
  ServiceUnavailable = 503,
}

export enum ErrorType {
  General,
  Transient,
  NoAccess,
}

export interface IServerError {
  readonly code: Code;
  readonly type: ErrorType;
  readonly message: string;
}

export class ServerError extends Error implements IServerError {
  readonly code: Code;
  readonly info: JSONValue;
  private _type?: ErrorType;
  internalInfo?: JSONValue;

  constructor(
    msg: string | Code,
    info?: any,
    code?: Code,
    internalInfo?: JSONValue
  ) {
    if (typeof msg !== 'string') {
      code = msg;
      msg = messageForCode(code);
    }
    super(msg);
    this.code = code || Code.InternalServerError;
    this.info = info;
    this.internalInfo = internalInfo;
  }

  toJS() {
    return toJS(this);
  }

  get type() {
    if (this._type === undefined) {
      this._type = typeFromCode(this.code);
    }
    return this._type;
  }

  static fromJS(obj: SerializedError) {
    return fromJS(obj);
  }
}

export function typeFromCode(code: number): ErrorType {
  switch (code) {
    case Code.AccessDenied:
    case Code.NotFound:
      return ErrorType.NoAccess;

    case Code.Conflict:
    case Code.Timeout:
    case Code.ServiceUnavailable:
    case Code.InternalServerError:
      return ErrorType.Transient;

    default:
      return ErrorType.General;
  }
}

export function fromCode(code: Code) {
  return new ServerError(code);
}

export function messageForCode(code: Code): string {
  // Take the name of the enum and insert spaces before caps
  return Code[code].replace(/([A-Z])/g, ' $1').trim();
}

export function notFound(message?: string): ServerError {
  return new ServerError(message || Code.NotFound, undefined, Code.NotFound);
}

export function badRequest(
  message?: string,
  internalInfo?: JSONValue
): ServerError {
  return new ServerError(
    message || Code.BadRequest,
    undefined,
    Code.BadRequest,
    internalInfo
  );
}

export function timeout(): ServerError {
  return new ServerError(Code.Timeout);
}

export function accessDenied(): ServerError {
  return new ServerError(Code.AccessDenied);
}

export function conflict(message?: string): ServerError {
  return new ServerError(message || Code.Conflict, undefined, Code.Conflict);
}

export function txnConflict(txnKey: string, dataRowKey: string) {
  return new ServerError(Code.Conflict, {
    txnKey,
    dataRowKey,
  });
}

export function serviceUnavailable(): ServerError {
  return new ServerError(Code.ServiceUnavailable);
}

export function incompatibleCFDSVersion(
  serverVersion: string,
  clientVersion: string
): ServerError {
  return new ServerError(Code.BadRequest, {
    sv: serverVersion,
    cv: clientVersion,
  });
}

export function unknownCommand(cmd: string, code: Code): ServerError {
  return new ServerError(
    code,
    {
      cmd: cmd,
    },
    undefined
  );
}

export function toJS(error: Error): SerializedError {
  const result: SerializedError = {
    msg: error.message,
    code: error instanceof ServerError ? error.code : Code.InternalServerError,
  };
  if (!(error instanceof ServerError)) {
    log({
      severity: 'ERROR',
      error: 'UncaughtServerError',
      message: error.message,
      trace: error.stack,
    });
  } else if (error.info) {
    result.info = error.info;
  }
  return result;
}

export function fromJS(obj: SerializedError): ServerError {
  return new ServerError(obj.msg, obj.info, obj.code);
}
