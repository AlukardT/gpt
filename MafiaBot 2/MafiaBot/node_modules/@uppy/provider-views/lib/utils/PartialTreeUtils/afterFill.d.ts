import type { PartialTree, PartialTreeId } from '@uppy/core';
import type { CompanionFile } from '@uppy/utils/lib/CompanionFile';
export type ApiList = (directory: PartialTreeId) => Promise<{
    nextPagePath: PartialTreeId;
    items: CompanionFile[];
}>;
declare const afterFill: (partialTree: PartialTree, apiList: ApiList, validateSingleFile: (file: CompanionFile) => string | null, reportProgress: (n: number) => void) => Promise<PartialTree>;
export default afterFill;
//# sourceMappingURL=afterFill.d.ts.map