import type { Body, Meta, UppyFile } from '@uppy/core';
import { h } from 'preact';
import type { UppyContext } from './types.js';
export type FilesGridProps = {
    editFile?: (file: UppyFile<Meta, Body>) => void;
    columns?: number;
    ctx: UppyContext;
};
export default function FilesGrid(props: FilesGridProps): h.JSX.Element;
//# sourceMappingURL=FilesGrid.d.ts.map