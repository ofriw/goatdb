import { SchemeManager } from '../../cfds/base/scheme.ts';

// export const kSchemeUser = {
//   ns: 'user',
//   version: 1,
//   fields: {
//     name: {
//       type: 'string',
//       default: () => 'Anonymous',
//     },
//     chats: {
//       type: 'set',
//       default: () => new Set<string>(),
//     },
//   },
// } as const;
// type SchemeUserType = typeof kSchemeUser;
// SchemeManager.default.register(kSchemeUser);

// export const kSchemeMessage = {
//   ns: 'message',
//   version: 1,
//   fields: {
//     sender: {
//       type: 'string',
//       required: true,
//     },
//     value: {
//       type: 'string',
//       required: true,
//     },
//   },
// } as const;
// type SchemeMessageType = typeof kSchemeMessage;
// SchemeManager.default.register(kSchemeMessage);

export const kSchemeTask = {
  ns: 'task',
  version: 1,
  fields: {
    text: {
      type: 'string',
      default: () => '',
    },
  },
} as const;
type SchemeTaskType = typeof kSchemeTask;
SchemeManager.default.register(kSchemeTask);
