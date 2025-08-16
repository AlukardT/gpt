import type { Body, DefinePluginOpts, Meta, UIPluginOptions, Uppy } from '@uppy/core';
import { UIPlugin } from '@uppy/core';
import type { LocaleStrings } from '@uppy/utils/lib/Translator';
import { type ComponentChild } from 'preact';
import locale from './locale.js';
export interface FileInputOptions extends UIPluginOptions {
    pretty?: boolean;
    inputName?: string;
    locale?: LocaleStrings<typeof locale>;
}
declare const defaultOptions: {
    pretty: boolean;
    inputName: string;
};
interface HTMLFileInputElement extends HTMLInputElement {
    files: FileList;
}
type Opts = DefinePluginOpts<FileInputOptions, keyof typeof defaultOptions>;
export default class FileInput<M extends Meta, B extends Body> extends UIPlugin<Opts, M, B> {
    static VERSION: string;
    input: HTMLFileInputElement | null;
    constructor(uppy: Uppy<M, B>, opts?: FileInputOptions);
    addFiles(files: File[]): void;
    private handleInputChange;
    private handleClick;
    render(): ComponentChild;
    install(): void;
    uninstall(): void;
}
export {};
//# sourceMappingURL=FileInput.d.ts.map