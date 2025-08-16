import type { Body, Meta, Uppy } from '@uppy/core';
import { type ProgressBarOptions } from '@uppy/progress-bar';
import { Component } from 'react';
interface ProgressBarProps<M extends Meta, B extends Body> extends ProgressBarOptions {
    uppy: Uppy<M, B>;
}
/**
 * React component that renders a progress bar at the top of the page.
 */
declare class ProgressBar<M extends Meta, B extends Body> extends Component<ProgressBarProps<M, B>> {
    private container;
    private plugin;
    componentDidMount(): void;
    componentDidUpdate(prevProps: ProgressBar<M, B>['props']): void;
    componentWillUnmount(): void;
    installPlugin(): void;
    uninstallPlugin(props?: Readonly<ProgressBarProps<M, B>>): void;
    render(): import("react").DetailedReactHTMLElement<{
        className: string;
        ref: (container: HTMLElement) => void;
    }, HTMLElement>;
}
export default ProgressBar;
//# sourceMappingURL=ProgressBar.d.ts.map