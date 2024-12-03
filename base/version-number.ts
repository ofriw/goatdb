import { Tuple4, tuple4Make } from './tuple.ts';

export type VersionNumber = Tuple4;

// 21/1/2024
export const V3_0_0: VersionNumber = tuple4Make([3, 0, 0, 0]);
// 25/1/2024
export const V3_0_1: VersionNumber = tuple4Make([3, 0, 1, 0]);
// 1/2/2024
export const V3_0_2: VersionNumber = tuple4Make([3, 0, 2, 0]);
// 8/2/2024
export const V3_1_0: VersionNumber = tuple4Make([3, 1, 0, 0]);
// 11/2/2024
export const V3_1_1: VersionNumber = tuple4Make([3, 1, 1, 0]);
// 14/2/2024
export const V3_1_2: VersionNumber = tuple4Make([3, 1, 2, 0]);
// 15/2/2024
export const V3_1_3: VersionNumber = tuple4Make([3, 1, 3, 0]);
// 19/2/2024
export const V3_1_4: VersionNumber = tuple4Make([3, 1, 4, 0]);
// 26/2/2024
export const V3_2_0: VersionNumber = tuple4Make([3, 2, 0, 0]);
// 17/3/2024
export const V3_3_0: VersionNumber = tuple4Make([3, 3, 0, 0]);
// 19/3/2024
export const V3_4_0: VersionNumber = tuple4Make([3, 4, 0, 0]);
// 26/3/2024
export const V3_4_1: VersionNumber = tuple4Make([3, 4, 1, 0]);
// 17/4/2024
export const V3_4_2: VersionNumber = tuple4Make([3, 4, 2, 0]);
// 18/4/2024
export const V3_4_3: VersionNumber = tuple4Make([3, 4, 3, 0]);
// 5/5/2024
export const V3_4_4: VersionNumber = tuple4Make([3, 4, 4, 0]);
// 9/5/2024
export const V3_4_5: VersionNumber = tuple4Make([3, 4, 5, 0]);
// 21/5/2024
export const V3_4_6: VersionNumber = tuple4Make([3, 4, 6, 0]);
export const V3_4_7: VersionNumber = tuple4Make([3, 4, 7, 0]);
export const V3_5_0: VersionNumber = tuple4Make([3, 5, 0, 0]);

export const VCurrent = V3_4_7;
