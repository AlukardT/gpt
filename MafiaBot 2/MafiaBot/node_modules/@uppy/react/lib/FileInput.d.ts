import type { Body, Meta, UIPluginOptions, Uppy } from '@uppy/core';
import { type FileInputOptions } from '@uppy/file-input';
import { Component } from 'react';
interface FileInputProps<M extends Meta, B extends Body> extends UIPluginOptions {
    uppy: Uppy<M, B>;
    locale?: FileInputOptions['locale'];
    pretty?: boolean;
    inputName?: string;
}
/**
 * React component that renders an area in which files can be dropped to be
 * uploaded.
 */
declare class FileInput<M extends Meta, B extends Body> extends Component<FileInputProps<M, B>> {
    static defaultProps: {
        locale: undefined;
        pretty: boolean;
        inputName: string;
    };
    private container;
    private plugin?;
    componentDidMount(): void;
    componentDidUpdate(prevProps: FileInputProps<M, B>): void;
    componentWillUnmount(): void;
    installPlugin(): void;
    uninstallPlugin(props?: Readonly<FileInputProps<M, B>>): void;
    render(): import("react").DetailedReactHTMLElement<{
        className: string;
        ref: (container: HTMLElement) => void;
    }, HTMLElement>;
}
export default FileInput;
//# sourceMappingURL=FileInput.d.ts.map