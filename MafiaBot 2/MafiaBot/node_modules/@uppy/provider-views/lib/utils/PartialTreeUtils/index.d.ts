declare const _default: {
    afterOpenFolder: (oldPartialTree: import("@uppy/core").PartialTree, discoveredItems: import("@uppy/utils/lib/CompanionFile").CompanionFile[], clickedFolder: import("@uppy/core").PartialTreeFolder, currentPagePath: string | null, validateSingleFile: (file: import("@uppy/utils/lib/CompanionFile").CompanionFile) => string | null) => import("@uppy/core").PartialTree;
    afterScrollFolder: (oldPartialTree: import("@uppy/core").PartialTree, currentFolderId: import("@uppy/core").PartialTreeId, items: import("@uppy/utils/lib/CompanionFile").CompanionFile[], nextPagePath: string | null, validateSingleFile: (file: import("@uppy/utils/lib/CompanionFile").CompanionFile) => string | null) => import("@uppy/core").PartialTree;
    afterToggleCheckbox: (oldTree: import("@uppy/core").PartialTree, clickedRange: string[]) => import("@uppy/core").PartialTree;
    afterFill: (partialTree: import("@uppy/core").PartialTree, apiList: import("./afterFill.js").ApiList, validateSingleFile: (file: import("@uppy/utils/lib/CompanionFile").CompanionFile) => string | null, reportProgress: (n: number) => void) => Promise<import("@uppy/core").PartialTree>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map