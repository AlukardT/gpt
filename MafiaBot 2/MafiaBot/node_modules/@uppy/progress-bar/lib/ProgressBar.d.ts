import type { Body, DefinePluginOpts, Meta, State, UIPluginOptions, Uppy } from '@uppy/core';
import { UIPlugin } from '@uppy/core';
import { type ComponentChild } from 'preact';
export interface ProgressBarOptions extends UIPluginOptions {
    hideAfterFinish?: boolean;
    fixed?: boolean;
}
declare const defaultOptions: {
    fixed: boolean;
    hideAfterFinish: boolean;
};
type Opts = DefinePluginOpts<ProgressBarOptions, keyof typeof defaultOptions>;
/**
 * Progress bar
 *
 */
export default class ProgressBar<M extends Meta, B extends Body> extends UIPlugin<Opts, M, B> {
    static VERSION: string;
    constructor(uppy: Uppy<M, B>, opts?: ProgressBarOptions);
    render(state: State<M, B>): ComponentChild;
    install(): void;
    uninstall(): void;
}
export {};
//# sourceMappingURL=ProgressBar.d.ts.map