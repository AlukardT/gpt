import type { Body, Meta, UppyFile } from '@uppy/core';
import { h } from 'preact';
import { type UppyContext } from './index.js';
export type FilesListProps = {
    editFile?: (file: UppyFile<Meta, Body>) => void;
    ctx: UppyContext;
};
export default function FilesList(props: FilesListProps): h.JSX.Element;
//# sourceMappingURL=FilesList.d.ts.map