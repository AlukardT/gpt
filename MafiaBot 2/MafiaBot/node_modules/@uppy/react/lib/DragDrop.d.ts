import type { Body, Meta, Uppy } from '@uppy/core';
import { type DragDropOptions } from '@uppy/drag-drop';
import { Component } from 'react';
interface DragDropProps<M extends Meta, B extends Body> extends DragDropOptions {
    uppy: Uppy<M, B>;
}
/**
 * React component that renders an area in which files can be dropped to be
 * uploaded.
 */
declare class DragDrop<M extends Meta, B extends Body> extends Component<DragDropProps<M, B>> {
    private container;
    private plugin;
    componentDidMount(): void;
    componentDidUpdate(prevProps: DragDrop<M, B>['props']): void;
    componentWillUnmount(): void;
    installPlugin(): void;
    uninstallPlugin(props?: Readonly<DragDropProps<M, B>>): void;
    render(): import("react").DetailedReactHTMLElement<{
        className: string;
        ref: (container: HTMLElement) => void;
    }, HTMLElement>;
}
export default DragDrop;
//# sourceMappingURL=DragDrop.d.ts.map